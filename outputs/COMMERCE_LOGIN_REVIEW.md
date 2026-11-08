# Login and checkout implementation review — 2026-11-08

Feature: Accessible mobile social-login selector, individual report checkout, lower entry price, optional Toss Payments integration.

Reviewed documents (applicable principles and commerce sections):
- Brand Bible: included in SAJU_WAR_MASTER_PLAN.md (Brand Essence, executive declaration); no separate Brand Bible file in repository.
- Master Plan: find your weapon; preserve a strategy-led product.
- Product Bible: login and Premium value preview, transparent checkout and refund links.
- AI Constitution: no fear-based upsell; no AI prompt changes.
- Knowledge Bible: preserve interpretation and next-action principles.
- Experience Bible: preserve battlefield assets; reduce checkout friction.
- Lore Bible: strategy room / weapon language; no competitor currency or characters.
- SAJUWAR METHOD: voluntary choices, clear next action.

Conflict level: 1 (presentation).
Resolution: keep existing battlefield brand; use reference only for familiar authentication and order-summary layout. Checkout prices are shown after report value, without scarcity or fabricated sales claims.
Required document update: none. Pricing change authorized by the user's request to lower prices; entry price uses the previously proposed 1,000 KRW. Existing masterbook and lecture unchanged.
Decision: implement. Social providers and PG stay disabled without actual credentials; test payments cannot grant production access. No paid application or contract submitted.

Validation: Node syntax checks, isolated local HTTP checks, mocked provider callback and PG confirmation tests. Provider end-to-end payments and actual social authentication require merchant/application credentials.

## Login reference refinement
2026-11-08: User repeated the four-provider reference. Login layout now uses full-width stacked yellow/green/white rows, selected report card above providers, and an email form disclosed on demand. No simulated social sign-in; unavailable providers remain visibly marked. No change to authentication or pricing logic in this refinement.

## Masterbook price update
2026-11-08: User explicitly set 인생 전장 마스터북 to 9,900 KRW. Update catalog and all purchase surfaces consistently; existing orders retain their recorded amount. This pricing-only change does not alter report content or the eight-document principles reviewed above.

## Free preview and paid entry migration — 2026-11-08

Feature: Keep a short free battle-type / weapon / interpretation preview; move the existing full free reading into the 1,000 KRW product.
Reviewed applicable principles from all eight documents previously listed: discovery before upsell (Product/Experience), weapon and strategy language (Brand/Master/Lore), evidence and uncertain interpretation (Knowledge/AI Constitution/METHOD). The free type is explicitly a day-stem sample, not a complete-chart judgment. No fear or scarcity copy.
Conflict level: 0. User approved the exact free-preview + paid-full-reading split.
Decision: return only bounded preview data for unauthenticated/unpaid analysis, generate the migrated full reading only after server-side purchase checks, preserve birth input across checkout, and retain the 9,900 KRW masterbook for deeper analysis.
Validation: analysis endpoint/alias access checks, absence of full reading/timelines in public payloads, authorized entry generation and caching, unknown-time profile persistence, rejection of cross-product access and different-profile reuse; inline JavaScript syntax checks.

## Saved birth profiles — 2026-11-08

Feature: Account-owned birth profiles for self, spouse, partner, parent, child, friend or a custom relationship; create, edit, delete and select for previews or ungenerated reports.
Eight-document review: Brand/Master retain weapon-discovery and strategy-room framing. Product Bible explicitly includes birth_profiles and family/partner profiles (onboarding backend and future expansion). AI Constitution/Knowledge/METHOD: stored relationship is a label, never a deterministic judgment or a new AI interpretation rule. Experience/Lore: a simple personal archive and clear input reuse, without currency, fear or paid advantage. Save requires login and uses per-user API authorization; other people's information is entered with their permission.
Conflict level: 0. Decision: implement within existing account and single-instance persistence model. Saving/editing/deleting a profile does not modify a purchased report, its binding, or its permissions. No pricing change.
Validation: CRUD, cross-user isolation, immutable ownership, date/time/custom-relation checks, unknown time, persistence, corrupted-store protection and login-required routes. Existing commerce and report-access checks continue to apply.
