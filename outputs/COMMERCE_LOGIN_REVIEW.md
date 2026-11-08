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
