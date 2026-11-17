import feedparser

from services.sources import exa_jobs, linkedin_apify, remote_boards, upwork
from services.sources.common import dedupe, employment_type, find_email, matches_keywords, parse_date


def test_remotive_normalizes():
    j = remote_boards.normalize_remotive({
        "url": "https://remotive.com/remote-jobs/data/analyst-1", "title": "Data Analyst", "company_name": "Acme",
        "candidate_required_location": "Worldwide", "job_type": "contract", "salary": "$60k",
        "description": "<p>SQL &amp; Python. Email jobs@acme.com</p>", "publication_date": "2026-11-10T10:00:00",
        "tags": ["sql"],
    })
    assert j["source"] == "remotive" and j["location"] == "" and j["employment_type"] == "contract"
    assert j["description"] == "SQL & Python. Email jobs@acme.com" and j["apply_email"] == "jobs@acme.com"
    assert j["posted_at"].year == 2026 and j["remote"] is True


def test_remoteok_skips_legal_notice_and_reads_tags():
    assert remote_boards.normalize_remoteok({"legal": "..."}) is None
    j = remote_boards.normalize_remoteok({"position": "BI Developer", "company": "Zed", "url": "https://remoteok.com/remote-jobs/1",
                                          "tags": ["Contract", "SQL"], "salary_min": 70000, "salary_max": 90000, "date": "2026-11-12T00:00:00+00:00",
                                          "description": "Power BI dashboards"})
    assert j["employment_type"] == "contract" and j["salary"] == "$70,000–$90,000"


def test_wwr_rss_splits_company_and_title():
    xml = ('<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Acme: Senior Data Analyst</title>'
           '<region>Anywhere in the World</region><type>Contract</type><description><![CDATA[<p>SQL and Python.</p>]]></description>'
           '<pubDate>Wed, 21 Oct 2026 12:54:56 +0000</pubDate><link>https://weworkremotely.com/remote-jobs/acme-1</link></item></channel></rss>')
    j = remote_boards.normalize_wwr(feedparser.parse(xml).entries[0])
    assert j["company"] == "Acme" and j["title"] == "Senior Data Analyst" and j["location"] == ""
    assert j["employment_type"] == "contract" and j["description"] == "SQL and Python."


def test_jobicy_normalizes():
    j = remote_boards.normalize_jobicy({"url": "https://jobicy.com/jobs/1", "jobTitle": "Data Analyst", "companyName": "Lemonade",
                                        "jobGeo": "UK", "jobType": ["Full-Time"], "jobLevel": "Senior", "jobDescription": "<p>x</p>",
                                        "pubDate": "2026-11-16T17:01:27+00:00", "annualSalaryMin": 80000, "annualSalaryMax": 100000, "salaryCurrency": "USD"})
    assert j["employment_type"] == "full_time" and j["location"] == "UK" and j["tags"] == ["Senior"] and "80000" in j["salary"]


def test_linkedin_and_exa_and_upwork_normalize():
    li = linkedin_apify.normalize_linkedin({"jobUrl": "https://linkedin.com/jobs/1", "title": "Analyst", "companyName": "C", "location": "Remote, US",
                                            "descriptionText": "d", "contractType": "Full-time", "publishedAt": "2026-11-01"})
    assert li["source"] == "linkedin" and li["remote"] is True and li["employment_type"] == "full_time"
    ex = exa_jobs.normalize_exa({"url": "https://boards.greenhouse.io/acme/jobs/123", "title": "Data Analyst - Acme", "text": "Remote role. SQL.",
                                 "publishedDate": "2026-11-05T00:00:00.000Z"})
    assert ex["company"] == "Acme" and ex["title"] == "Data Analyst" and ex["remote"] is True
    ex2 = exa_jobs.normalize_exa({"url": "https://jobs.lever.co/zed/abc", "title": "BI Developer", "text": "onsite"})
    assert ex2["company"] == "Zed" and ex2["remote"] is None
    up = upwork.normalize_upwork({"id": "1", "ciphertext": "~01abc", "title": "Build a Power BI dashboard", "description": "d",
                                  "skills": [{"name": "Power BI"}], "hourlyBudgetMin": {"rawValue": "30"}, "hourlyBudgetMax": {"rawValue": "50"},
                                  "client": {"location": {"country": "United States"}}, "createdDateTime": "2026-11-10T00:00:00Z"})
    assert up["source_url"].endswith("~01abc") and up["salary"] == "$30–$50/hr" and up["tags"] == ["Power BI"] and up["employment_type"] == "contract"


def test_helpers():
    assert employment_type("Freelance BI dev") == "contract"
    assert employment_type("full-time contract") == "contract"      # contract wording wins
    assert employment_type("nothing") == ""
    assert find_email("mail me at a.b+c@x.co.uk now") == "a.b+c@x.co.uk"
    assert parse_date("2026-11-10").tzinfo is not None and parse_date("garbage") is None
    job = {"title": "Senior Data Analyst", "description": "Power BI and SQL"}
    assert matches_keywords(job, ["data analyst"]) and matches_keywords(job, ["power bi"])
    assert not matches_keywords(job, ["data engineer"])
    assert len(dedupe([{"source_url": "a"}, {"source_url": "a"}, None, {"source_url": "b"}])) == 2
