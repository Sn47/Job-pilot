from datetime import datetime, timezone

from services import pipeline
from services.sources import remote_boards

MASTER = """# Jane Doe
jane@x.com · +1 555 · Lisbon

## Summary
Data analyst with 5 years in SaaS reporting.

## Skills
SQL, Python, Power BI, dbt

## Experience
### Data Analyst — Acme
2020–2024
- Built the company KPI dashboard in Power BI, cut weekly reporting time 40%
- Modeled 30 tables with dbt on Snowflake
"""


async def _seed(client):
    await client.put("/api/candidate", json={"full_name": "Jane Doe", "master_resume": MASTER, "skills": ["sql", "python", "power bi", "dbt"],
                                              "target_titles": ["data analyst"], "keywords": ["data analyst"], "min_score": 5})


async def test_candidate_roundtrip(client):
    r = await client.get("/api/candidate")
    assert r.status_code == 200 and r.json()["id"] == 1 and r.json()["preferences"]["remote_only"] is True
    r = await client.put("/api/candidate", json={"target_titles": [" data analyst ", ""], "preferences": {"remote_only": False}})
    assert r.json()["target_titles"] == ["data analyst"] and r.json()["preferences"]["remote_only"] is False
    assert (await client.get("/api/candidate/status")).json()["writer"] == "none"


async def test_scan_scores_saves_and_dedupes(client, monkeypatch):
    await _seed(client)

    async def fake_boards(keywords):
        return [
            remote_boards.normalize_remotive({"url": "https://r/1", "title": "Data Analyst", "company_name": "A", "candidate_required_location": "USA",
                                              "description": "SQL Python Power BI dbt", "publication_date": datetime.now(timezone.utc).isoformat()}),
            remote_boards.normalize_remotive({"url": "https://r/2", "title": "Dentist", "company_name": "B", "description": "teeth"}),
            remote_boards.normalize_remotive({"url": "https://r/3", "title": "Data Analyst", "company_name": "C", "candidate_required_location": "Pune, India",
                                              "description": "SQL"}),
        ]
    monkeypatch.setattr(remote_boards, "run", fake_boards)

    assert (await client.post("/api/jobs/scan")).status_code == 200
    import asyncio
    for _ in range(50):
        await asyncio.sleep(0.05)
        if pipeline.LAST_RUN["status"] in ("done", "error"):
            break
    run = pipeline.LAST_RUN
    assert run["status"] == "done", run["errors"]
    assert run["new"] == 1 and run["skipped"] == 2

    jobs = (await client.get("/api/jobs?status=new")).json()["jobs"]
    assert len(jobs) == 1 and jobs[0]["title"] == "Data Analyst" and jobs[0]["score"] >= 7
    skipped = (await client.get("/api/jobs?status=skipped")).json()["jobs"]
    assert {j["skip_reason"] for j in skipped} == {"score_low", "region_excluded"}

    # second scan: same listings are duplicates, nothing new
    await client.post("/api/jobs/scan")
    for _ in range(50):
        await asyncio.sleep(0.05)
        if pipeline.LAST_RUN["status"] in ("done", "error"):
            break
    assert pipeline.LAST_RUN["new"] == 0 and pipeline.LAST_RUN["duplicates"] == 1


async def test_tailor_builds_kit_and_exports(client, monkeypatch):
    await _seed(client)
    from models import Job
    from database import AsyncSessionFactory
    async with AsyncSessionFactory() as db:
        db.add(Job(source="remotive", source_url="https://r/9", title="Data Analyst", company="Acme", description="SQL and Power BI", score=8.0))
        await db.commit()

    from services import llm
    monkeypatch.setattr(llm, "configured", lambda: True)
    calls = []

    async def fake_complete(prompt, system="", max_tokens=0):
        calls.append(prompt[:40])
        if "Return JSON only:\n{\"resume_md\"" in prompt:
            return '```json\n{"resume_md": "# Jane Doe\\n## Summary\\nPower BI analyst, cut reporting time 40%", "matched_skills": ["sql"], "gaps": ["tableau"], "keywords_used": ["Power BI"]}\n```'
        if "cover letter" in prompt:
            return "Dear Acme, ...\nJane Doe"
        return '{"answers": {"Why do you want this role?": "Because dashboards.", "Salary expectation": "[fill in]"}}'
    monkeypatch.setattr(llm, "complete", fake_complete)

    r = await client.post("/api/jobs/1/tailor")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "tailored" and j["tailored_resume"].startswith("# Jane Doe") and j["cover_letter"].endswith("Jane Doe")
    assert j["answers"]["Salary expectation"] == "[fill in]" and j["kit_notes"]["gaps"] == ["tailored"][:0] + ["tableau"]
    assert j["kit_notes"]["warnings"] == []
    assert len(calls) == 3

    assert (await client.get("/api/jobs/1/resume.pdf")).headers["content-type"] == "application/pdf"
    assert (await client.get("/api/jobs/1/cover-letter.docx")).status_code == 200
    assert (await client.get("/api/jobs/1/resume.txt")).status_code == 400

    r = await client.patch("/api/jobs/1/kit", json={"cover_letter": "edited"})
    assert r.json()["cover_letter"] == "edited"
    r = await client.patch("/api/jobs/1/status?status=applied")
    assert r.json()["status"] == "applied" and r.json()["applied_at"]
    assert (await client.patch("/api/jobs/1/status?status=bogus")).status_code == 400
    assert (await client.get("/api/jobs/stats")).json()["by_status"] == {"applied": 1}


async def test_tailor_requires_resume_and_llm(client):
    from models import Job
    from database import AsyncSessionFactory
    async with AsyncSessionFactory() as db:
        db.add(Job(source="remotive", source_url="https://r/9", title="x", description="d"))
        await db.commit()
    r = await client.post("/api/jobs/1/tailor")
    assert r.status_code == 502 and "No LLM" in r.json()["detail"]


async def test_resume_upload_without_llm_stores_raw(client):
    r = await client.post("/api/candidate/resume/upload", files={"file": ("cv.txt", b"Jane Doe\n" + b"Did analyst work. " * 20, "text/plain")})
    assert r.status_code == 200 and r.json()["converted"] is False
    assert (await client.get("/api/candidate")).json()["master_resume"].startswith("Jane Doe")
