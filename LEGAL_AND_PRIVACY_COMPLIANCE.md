# Privacy, confidential material and publication policy

Status: preventive repository policy, 17 September 2026. This document is not a finding of legal compliance, a licence grant, or proof that previous publications have been removed.

## Allowed content and responsibility

Use synthetic examples, original training material and third-party resources whose exact licence and redistribution conditions have been verified. Keep a source URL, licence/version, attribution and permission evidence with each dataset or media asset. An accessible download or a purchased book does not establish redistribution permission. Do not commit commercial book copies, meeting recordings, participant rosters, children's photographs, school/club presentations, customer documents, credentials or raw operational exports. Link to the lawful source instead.

The repository maintainer is responsible for recording the material owner, intended audience and retention period before accepting new media. Existing assets still require a provenance review; passing CI does not approve their copyright or privacy status. Source generation scripts alone do not establish rights in input texts, models, voices or images.

## Personal information and Amendment 13

Israel's Privacy Protection Authority guide states that Amendment 13 took effect on 14 August 2025, broadens personal-information definitions, strengthens enforcement and specifies DPO obligations for defined categories of organisations. Applicability depends on actual processing and organisational facts. The owner must document purposes, lawful authority, notice, access, retention, security and applicable registration/notification/DPO obligations with qualified review. A repository audit cannot establish those facts. [Official PPA guide](https://www.gov.il/BlobFolder/reports/guide_tikon13_professional/he/tikun%2013%20_170825.pdf).

For this training project, use synthetic/de-identified material by default. Keep identifiable children's information and recordings out of these repositories and public course exports. If real personal data is necessary, assess authority and permissions, minimise it, and store it in a separately controlled system with access logging and a deletion process. Do not assume encryption or a shared classroom code authorises publication.

## Internal NDA separation

“Tier 1” means shareable training material; “Tier 2” means client, employer or partner confidential information governed by the actual agreement. These are internal labels, not statutory classifications and not the platform's infrastructure tiers. Keep Tier 2 material in separately authorised storage/repositories with named access, an owner and retention controls. Redact examples before review or sharing. A private GitHub repository alone does not prove compliance with an NDA.

## Publication and incidents

Run the tracked-file security guard and review the exact staged diff before publication. .gitignore only affects untracked files; CI adds a separate check against force-added restricted paths and selected credential patterns. Neither checks every possible secret nor verifies every media licence. The two public verifier .bin files and encrypted .enc payloads are intentional course assets; they are not a mechanism for publishing confidential third-party material.

If sensitive material was previously committed: stop further publication, identify repositories, refs, releases, Actions artifacts, Pages deployments and recipients, rotate exposed credentials at their issuer, and assess notification/deletion obligations. Changing ignore rules or rewriting Git history does not revoke credentials or erase other people's copies. History rewrites, deletion of remote artifacts and notification to third parties require a concrete incident scope and coordinated execution.
