from services import suggest

MD = """# Jane Doe
jane@x.com

## Skills
SQL, Python, Power BI, dbt, Snowflake, Airflow

## Experience
### Senior Data Analyst — Acme
2021–2024
- things
### BI Developer at Zed Ltd
2018–2021
### Data Analyst (contract) | Foo
2016–2018

## Education
### BSc Statistics — University
"""


def test_titles_strip_seniority_and_dedupe():
    assert suggest.titles_from_resume(MD) == ["data analyst", "bi developer"]      # degree under Education is not a title
    assert suggest.titles_from_resume("### Data Engineer — X\n### Analyst at Y") == ["data engineer", "analyst"]   # no sections: whole text


def test_skills_from_skills_section_only():
    assert suggest.skills_from_resume(MD) == ["sql", "python", "power bi", "dbt", "snowflake", "airflow"]
    assert suggest.skills_from_resume("# No skills here") == []


def test_related_titles():
    r = suggest.related_titles(["data analyst", "bi developer"])
    assert "analytics engineer" in r and "data analyst" not in r


async def test_suggestions_and_setup_state(client):
    await client.put("/api/candidate", json={"master_resume": MD})
    r = (await client.get("/api/candidate/suggestions")).json()
    assert r["titles"][0] == "data analyst" and "power bi" in r["skills"]
    setup = (await client.get("/api/candidate")).json()["setup"]
    assert setup["has_resume"] is True and setup["ready"] is False
    await client.put("/api/candidate", json={"target_titles": ["data analyst"]})
    assert (await client.get("/api/candidate")).json()["setup"]["ready"] is True
