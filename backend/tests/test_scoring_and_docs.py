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
    assert documents.extract_text("r.txt", b"plain") == "plain"


def test_invention_guard():
    master = "## Experience\n- Grew revenue 40% in 2021\n- Team of 6"
    assert tailor.check_no_invention(master, "- Grew revenue 40% in 2021\n- Team of 6") == []
    issues = tailor.check_no_invention(master, "- Grew revenue 75% in 2019")
    assert any("75%" in i for i in issues) and any("2019" in i for i in issues)
