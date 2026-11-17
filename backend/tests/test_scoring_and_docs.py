from datetime import datetime, timedelta, timezone

from services import documents, tailor
from services.scoring import parse_annual_usd, score_job

CAND = {
    "target_titles": ["data analyst", "bi developer"],
    "skills": ["python", "sql", "power bi", "dbt", "tableau", "airflow", "snowflake"],
    "exclude_keywords": ["clearance"],
    "preferences": {"remote_only": True, "employment": "any", "min_salary_usd": 80000, "exclude_countries": ["India"], "seniority": ["mid", "senior"]},
}


def _job(**kw):
    base = {"title": "Senior Data Analyst (Remote)", "company": "Acme", "location": "USA", "remote": True, "employment_type": "full_time",
            "salary": "$95k–$120k", "description": "We need SQL, Python and Power BI. dbt a plus.", "posted_at": datetime.now(timezone.utc) - timedelta(days=1)}
    base.update(kw)
    return base


def test_strong_match_scores_high():
    total, b = score_job(_job(), CAND)
    assert total >= 9 and b["title"]["points"] == 3.0 and b["skills"]["points"] == 2.0 and b["freshness"]["points"] == 1.0
    assert b["hard_skip"] == ""


def test_excluded_country_and_fulltime_when_contract_only_are_hard_skips():
    _, b = score_job(_job(location="Bangalore, India"), CAND)
    assert b["hard_skip"] == "region_excluded"
    cand = {**CAND, "preferences": {**CAND["preferences"], "employment": "contract"}}
    _, b = score_job(_job(), cand)
    assert b["hard_skip"] == "engagement_fulltime"


def test_salary_floor_and_exclude_words_and_junior():
    _, b = score_job(_job(salary="$40k"), CAND)
    assert b["hard_skip"] == "salary_low"
    total, b = score_job(_job(description="SQL. Requires security clearance."), CAND)
    assert "excluded" in b and total < 8
    _, b = score_job(_job(title="Junior Data Analyst"), CAND)
    assert b["seniority"]["points"] == 0.0


def test_parse_salary():
    assert parse_annual_usd("$95k–$120k") == 95000
    assert parse_annual_usd("", "pays USD 110,000 per year") == 110000
    assert parse_annual_usd("$5", "") is None


def test_pdf_and_docx_roundtrip():
    md = "# Jane Doe\njane@x.com · Remote\n\n## Summary\nAnalyst with **5 years**.\n\n## Experience\n### Data Analyst — Acme\n2020–2024\n- Cut reporting time 40%\n"
    pdf = documents.markdown_to_pdf(md)
    docx = documents.markdown_to_docx(md)
    assert pdf[:4] == b"%PDF" and len(docx) > 1000
    assert "Cut reporting time 40%" in documents.extract_text("r.pdf", pdf)
    assert "Jane Doe" in documents.extract_text("r.docx", docx)
    from docx import Document
    import io
    rendered_doc = Document(io.BytesIO(docx))
    assert rendered_doc.paragraphs[0].style.name == "Title"
    assert rendered_doc.paragraphs[1].text == "jane@x.com · Remote"
    assert rendered_doc.sections[0].top_margin.inches < 1
    assert documents.extract_text("r.txt", b"plain") == "plain"


def test_invention_guard():
    master = "## Experience\n- Grew revenue 40% in 2021\n- Team of 6"
    assert tailor.check_no_invention(master, "- Grew revenue 40% in 2021\n- Team of 6") == []
    issues = tailor.check_no_invention(master, "- Grew revenue 75% in 2019")
    assert any("75%" in i for i in issues) and any("2019" in i for i in issues)


def test_parse_json_accepts_raw_newlines_in_strings():
    from services import llm
    raw = '{"resume_md": "line1\nline2", "skills": ["sql"]}'
    assert llm.parse_json(raw) == {"resume_md": "line1\nline2", "skills": ["sql"]}


def test_prompt_fill_preserves_braces_in_values_and_templates():
    prompt = tailor._fill('Resume: {master}\nTitle: {title}\n{"answers": {...}}',
                          master="Role: {title}", title="Analyst")
    assert "Resume: Role: {title}" in prompt
    assert "Title: Analyst" in prompt
    assert '{"answers": {...}}' in prompt


async def test_tailor_resume_parses_markdown_and_metadata(monkeypatch):
    async def fake_complete(prompt, system="", max_tokens=0):
        assert "Candidate master resume" in prompt
        return '# Jane Doe\n## Summary\nAnalyst with 5 years\n---JSON---\n{"matched_skills": ["sql"], "gaps": ["tableau"], "keywords_used": ["analytics"]}'

    monkeypatch.setattr(tailor.llm, "complete", fake_complete)
    result = await tailor.tailor_resume(
        "Jane Doe\n5 years", ["sql"],
        {"title": "Analyst", "company": "Acme", "description": "Analytics"},
    )
    assert result["resume_md"].startswith("# Jane Doe")
    assert result["gaps"] == ["tableau"]


def test_parse_imported_resume_markdown_then_json():
    text = "# Jane Doe\n\n## Skills\nSQL\n---JSON---\n{\"full_name\": \"Jane Doe\", \"skills\": [\"sql\"]}"
    data = tailor.parse_imported_resume(text)
    assert data["resume_md"].startswith("# Jane Doe") and data["full_name"] == "Jane Doe" and data["skills"] == ["sql"]


def test_parse_imported_resume_legacy_json():
    text = '```json\n{"resume_md": "# Jane\\n## Summary\\nAnalyst", "skills": ["sql"]}\n```'
    assert tailor.parse_imported_resume(text)["resume_md"].startswith("# Jane")


def test_resume_chunks_cover_the_whole_file():
    raw = ("para\n\n" * 5000)
    parts = tailor._resume_chunks(raw)
    assert sum(len(p) for p in parts) >= len(raw) - 20
    assert len(parts) > 1
    merged = tailor._merge_import([
        {"resume_md": "# A\nexp 1", "skills": ["sql"], "full_name": "Jane"},
        {"resume_md": "exp 2", "skills": ["SQL", "python"]},
    ])
    assert "exp 1" in merged["resume_md"] and "exp 2" in merged["resume_md"]
    assert merged["skills"] == ["sql", "python"] and merged["full_name"] == "Jane"
