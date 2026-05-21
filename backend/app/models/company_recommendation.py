# contract: keep in sync with connect-grow-hire/src/types/companyRecommendation.ts
from dataclasses import dataclass, field, asdict


@dataclass
class ScoutSentence:
    rung: str           # 'R1'–'R5'
    headline: str       # italic serif headline (hero) or aggregate stat
    detail: str         # sans detail paragraph (hero) or fit sentence
    short: str          # compact 1-liner for list rows
    stat_value: str     # hero stat numeral (e.g. "12", " - ")
    stat_label: str     # unit below the stat (e.g. "alumni", "on your radar")
    facts_used: list = field(default_factory=list)  # empty for R4/R5 deterministic


@dataclass
class CompanyMark:
    letters: str        # 1-2 char monogram
    color: str          # hex color


@dataclass
class CompanyRecommendation:
    rank: int
    id: str
    name: str
    mark: CompanyMark
    sector: str
    city: str
    scout: ScoutSentence

    def to_dict(self):
        return asdict(self)
