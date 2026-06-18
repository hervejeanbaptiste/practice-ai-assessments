from pathlib import Path
import json
import os
import sys

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"
sys.path.insert(0, str(WORK))

os.environ.setdefault("AI_REPORT_DATA", str(ROOT / "work/actual_data"))
os.environ.setdefault("AI_REPORT_ENGAGEMENT", str(ROOT / "work/june_15/engagement_june_15_candidate.xlsx"))
os.environ.setdefault("AI_REPORT_CURRENT_SHEET", "Update June 15")
os.environ.setdefault("AI_REPORT_PRIOR_SHEET", "Update June 8")

import reviewed_reports as rr  # noqa: E402
import full_suite_reports as fs  # noqa: E402


DATA = ROOT / "work/actual_data"
ENGAGEMENT = ROOT / "work/june_15/engagement_june_15_candidate.xlsx"
OUT = ROOT / "app/leaderboard/data"
MASTER_SUITE = ROOT / "outputs/ai_adoption_report_automation/full_report_suite_current_techex_consolidated"
MASTER_DELIVERY = ROOT / "outputs/ai_adoption_report_automation/audience_delivery_current_techex_consolidated"
WEEKS = [
    {"id": "2026-06-01", "label": "June 1", "sheet": "Update June 1"},
    {"id": "2026-06-08", "label": "June 8", "sheet": "Update June 8"},
    {"id": "2026-06-15", "label": "June 15", "sheet": "Update June 15"},
]


def person_name(row):
    return str(row.get("Preferred Name") or row.get("Legal Name") or "").strip()


def active_for_week(sheet, prior_sheet=None):
    active = pd.read_excel(DATA / "active_workers.xlsx", sheet_name="Active Workers", dtype=str).fillna("")
    current = pd.read_excel(ENGAGEMENT, sheet_name=sheet, dtype=str).fillna("")
    prior = pd.read_excel(ENGAGEMENT, sheet_name=prior_sheet, dtype=str).fillna("") if prior_sheet else None
    return rr.apply_engagement_fields(active, current, prior)


def summarize_people(employee_ids, people_by_id, week_id, prior_week_id=None):
    counts = {tier: 0 for tier in rr.LOW}
    prior_counts = {tier: 0 for tier in rr.LOW}
    transitions = {src: {dst: 0 for dst in rr.LOW} for src in rr.LOW}
    unmatched = 0
    for employee_id in employee_ids:
        person = people_by_id.get(str(employee_id))
        if not person:
            continue
        current = person["tiers"].get(week_id, "")
        prior = person["tiers"].get(prior_week_id, "") if prior_week_id else ""
        if current in counts:
            counts[current] += 1
        else:
            unmatched += 1
        if prior in prior_counts:
            prior_counts[prior] += 1
        if prior in rr.LOW and current in rr.LOW:
            transitions[prior][current] += 1
    return {
        "active": len(employee_ids),
        "counts": counts,
        "deltas": {tier: counts[tier] - prior_counts[tier] for tier in rr.LOW},
        "unmatched": unmatched,
        "transitions": transitions,
    }


def rpo_report(active):
    roster = pd.read_excel(DATA / "roster.xlsx", sheet_name="RPO and COV Data", dtype=str).fillna("")
    target = roster[
        roster["Role / Label"].str.contains("RPO|Coverage Lead", case=False, regex=True, na=False)
    ].copy()
    target = target.drop_duplicates(["Email", "Name", "Role / Label", "Lens", "Value"])

    active_by_email = active.assign(_email=active["Work Email"].map(rr.norm)).set_index("_email")
    active_by_name = active.assign(_name=active["person_name"].map(rr.norm)).set_index("_name")
    matched_ids = []
    for _, row in target.iterrows():
        email_key = rr.norm(row["Email"])
        name_key = rr.norm(row["Name"])
        match = None
        if email_key and email_key in active_by_email.index:
            match = active_by_email.loc[email_key]
        elif name_key and name_key in active_by_name.index:
            match = active_by_name.loc[name_key]
        if match is not None:
            if isinstance(match, pd.DataFrame):
                match = match.iloc[0]
            matched_ids.append(str(match["Employee ID"]).strip())

    return {
        "id": "RPO_and_Coverage_Leads",
        "group": "Specialty Groups",
        "name": "RPO and Coverage Leads",
        "lead": "Josette Yaplito; Justin White",
        "employeeIds": sorted(set(matched_ids)),
    }


def clean_erg_group(value):
    text = str(value or "").strip()
    text = text.replace(" ERG Teams Channel", "")
    text = text.replace("Teams Channel", "")
    text = text.strip()
    if text == "Women's Leadership Network (WLN)":
        return "WLN"
    if text == "WMPride":
        return "WMPRIDE"
    return text


def erg_reports(active):
    erg = pd.read_excel(DATA / "erg_all_roster_updated_2025_06_10.xlsx", sheet_name="Export", dtype=str).fillna("")
    erg = erg[erg["Employee Id"].str.strip().ne("") & erg["Group"].str.strip().ne("")].copy()
    erg = erg[~erg["Group"].str.contains("No filters applied", case=False, na=False)].copy()
    erg["Employee ID"] = erg["Employee Id"].astype(str).str.strip()
    erg["Work Email"] = erg["Work Email"].astype(str).str.strip()
    erg["Split ERG"] = erg["Group"].map(clean_erg_group)
    exploded = erg.drop_duplicates(["Employee ID", "Split ERG"]).copy()

    active_ids = set(active["Employee ID"].astype(str).str.strip())
    active_by_email = active.assign(_email=active["Work Email"].map(rr.norm)).set_index("_email")
    missing_id = exploded[~exploded["Employee ID"].isin(active_ids)].copy()
    email_matches = {}
    for _, row in missing_id.iterrows():
        key = rr.norm(row["Work Email"])
        if key and key in active_by_email.index:
            match = active_by_email.loc[key]
            if isinstance(match, pd.DataFrame):
                match = match.iloc[0]
            email_matches[row["Employee ID"]] = str(match["Employee ID"]).strip()
    if email_matches:
        exploded["Employee ID"] = exploded["Employee ID"].replace(email_matches)

    reports = []
    all_ids = sorted(set(exploded["Employee ID"]) & active_ids)
    reports.append({
        "id": "All_ERGs",
        "group": "Specialty Groups",
        "name": "All ERGs",
        "lead": "Ryan Brown",
        "employeeIds": all_ids,
    })
    for erg_name in sorted(exploded["Split ERG"].dropna().unique(), key=str.lower):
        ids = sorted(set(exploded.loc[exploded["Split ERG"].eq(erg_name), "Employee ID"]) & active_ids)
        reports.append({
            "id": rr.safe(f"ERG_{erg_name}"),
            "group": "Specialty Groups",
            "name": erg_name,
            "lead": "Ryan Brown",
            "employeeIds": ids,
        })
    return reports


def report_ids_from_workbook(path):
    detail = pd.read_excel(path, sheet_name="People Detail", dtype=str).fillna("")
    if "Employee ID" not in detail.columns:
        return []
    return detail["Employee ID"].astype(str).str.strip().loc[lambda s: s.ne("")].tolist()


def master_report_specs(group_name, delivery_subdir):
    summary = pd.read_csv(MASTER_SUITE / "individual_report_generation_summary.csv", dtype=str).fillna("")
    if group_name == "Practice Line":
        summary_rows = summary[~summary["Report"].str.startswith("General ")].copy()
    else:
        summary_rows = summary[summary["Report"].str.startswith("General ")].copy()

    workbooks = sorted((MASTER_DELIVERY / delivery_subdir).glob("*/report.xlsx"))
    reports = []
    if len(workbooks) != len(summary_rows):
        print(f"WARNING: {group_name} master workbook count {len(workbooks)} does not match summary count {len(summary_rows)}")

    for (_, row), workbook in zip(summary_rows.iterrows(), workbooks):
        ids = report_ids_from_workbook(workbook)
        expected = int(row.get("Active Workers") or 0)
        if expected != len(ids):
            print(f"WARNING: {row['Report']} expected {expected} active workers but workbook has {len(ids)}")
        reports.append({
            "id": rr.safe(row["Report"]),
            "group": group_name,
            "name": row["Report"],
            "lead": row["Lead"],
            "employeeIds": ids,
            "sourceWorkbook": str(workbook),
        })
    return reports


def office_reports(active):
    reports = []
    locations = active["Location"].astype(str).str.strip()
    for location in sorted([value for value in locations.unique() if value], key=str.lower):
        ids = active.loc[locations.eq(location), "Employee ID"].astype(str).str.strip().tolist()
        reports.append({
            "id": rr.safe(f"Office_{location}"),
            "group": "Office",
            "name": location,
            "lead": "Office Leaderboard",
            "employeeIds": ids,
        })
    return reports


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    week_frames = {}
    prior_by_week = {}
    for idx, week in enumerate(WEEKS):
        prior_sheet = WEEKS[idx - 1]["sheet"] if idx else None
        prior_by_week[week["id"]] = WEEKS[idx - 1]["id"] if idx else None
        week_frames[week["id"]] = active_for_week(week["sheet"], prior_sheet)

    active_current, assignment, notes_exceptions = fs.prepare_reviewed_active_and_general()
    active_current["person_name"] = active_current["Preferred Name"].where(active_current["Preferred Name"].ne(""), active_current["Legal Name"])
    line_reports = master_report_specs("Practice Line", "02_line")
    general_reports = master_report_specs("Practice General", "03_general")
    office_specs = office_reports(active_current)
    specialty_specs = [rpo_report(active_current)] + erg_reports(active_current)

    people_by_id = {}
    for _, row in active_current.iterrows():
        employee_id = str(row["Employee ID"]).strip()
        people_by_id[employee_id] = {
            "employeeId": employee_id,
            "name": person_name(row),
            "email": str(row.get("Work Email", "")),
            "practice": str(row.get("Practice", "")),
            "discipline": str(row.get("Discipline", "")),
            "costCenter": str(row.get("Cost Center", "")),
            "role": str(row.get("Business Title", "")),
            "level": str(row.get("Management Level", "")),
            "tiers": {},
        }

    for week_id, frame in week_frames.items():
        for _, row in frame.iterrows():
            employee_id = str(row["Employee ID"]).strip()
            if employee_id in people_by_id:
                people_by_id[employee_id]["tiers"][week_id] = str(row.get("current_tier", ""))

    reports = line_reports + general_reports + office_specs

    firm_ids = active_current["Employee ID"].astype(str).str.strip().tolist()
    line_ids = sorted({eid for report in reports if report["group"] == "Practice Line" for eid in report["employeeIds"]})
    general_ids = sorted({eid for report in reports if report["group"] == "Practice General" for eid in report["employeeIds"]})
    office_ids = sorted({eid for report in reports if report["group"] == "Office" for eid in report["employeeIds"]})
    reports = [
        {"id": "Firm_Total", "group": "Leaderboard", "name": "Firm Total", "lead": "All AI Champions", "employeeIds": firm_ids},
        {"id": "Practice_Line_Total", "group": "Leaderboard", "name": "Practice = Line Total", "lead": "All AI Champions", "employeeIds": line_ids},
        {"id": "Practice_General_Total", "group": "Leaderboard", "name": "Practice = General Total", "lead": "All AI Champions", "employeeIds": general_ids},
        {"id": "Office_Total", "group": "Leaderboard", "name": "Office Total", "lead": "All AI Champions", "employeeIds": office_ids},
    ] + reports + specialty_specs

    for report in reports:
        series = []
        for week in WEEKS:
            summary = summarize_people(report["employeeIds"], people_by_id, week["id"], prior_by_week[week["id"]])
            series.append({"weekId": week["id"], **summary})
        report["series"] = series

    payload = {
        "generatedFrom": str(ENGAGEMENT),
        "tiers": rr.LOW,
        "weeks": WEEKS,
        "defaultWeekId": WEEKS[-1]["id"],
        "defaultCompareWeekId": WEEKS[-2]["id"],
        "reports": reports,
        "people": list(people_by_id.values()),
    }
    (OUT / "leaderboard-data.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(OUT / "leaderboard-data.json")


if __name__ == "__main__":
    main()
