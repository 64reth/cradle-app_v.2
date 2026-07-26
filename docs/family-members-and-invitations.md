# Family Members and Invitations

## Member and account separation

A household Member is the durable person-in-the-home record. A `user_account` is authentication identity. A Member may exist without an account and an account claims at most one Member in a household.

New profiles use lifecycle states independently from invitation state:

- `managed`: a Household admin manages a Managed member profile without an account;
- `unclaimed`: profile exists and can be invited later;
- `invited`: a live profile-specific invitation exists;
- `join_requested`: an ambiguous general-invite claim awaits review;
- `active`: linked to an authenticated account;
- `suspended`: access is disabled but history remains;
- `left`: no longer an active household participant.

Existing Phase 3 credential-bearing Members remain compatible. Newly created Owners and invite claimants use explicit `user_accounts` links.

## Family creation

The Owner can add family during onboarding without sending invitations. Owner and Parent/Admin can add family later from the Dashboard. The ordinary form asks for name, plain-language relationship/role, age group, and whether to invite now or later. A stable client key makes creation retry-safe.

Children and dependants default to managed profiles. Adult profiles default to unclaimed. Profile creation never manufactures credentials, sessions, or accounts.

## Invitation types

Profile-specific invitations are preferred. They contain a fixed target Member and cannot claim another profile.

General household invitations create a join request. The recipient can request an unclaimed profile or propose a new profile, but ambiguous identity is never auto-approved. Household leadership links, creates, or declines from the Dashboard.

Each invitation stores only token and joining-code hashes, expiry, use limit, creator, purpose, target, revocation, acceptance and audit timestamps. Raw secrets are returned only when generated. Available expiries are 24 hours, 7 days and 30 days; 7 days is the default.

The invitation result provides Copy link, Copy code, scannable QR, native Share where supported, and Done. After reload, leadership regenerates a secret rather than retrieving stored raw material.

## Security and retries

All management routes derive household and Member identity from the session. Composite foreign keys enforce tenant boundaries. Revoked, expired and exhausted invitations return typed safe errors. Profile acceptance uses a conditional D1 batch to create the account, link the fixed Member and accept the invite.

Repeated acceptance with the same account details creates a fresh session rather than another account or Member. One account cannot claim two Members in one household and one Member cannot be claimed twice.

The legacy auto-join endpoint is retired. General invitations cannot silently create active household membership.

## Permissions

Owner and Parent/Admin manage ordinary profiles, invitations and join requests. Only the Owner can complete foundational onboarding. Parent/Admin cannot alter ownership. Adults and Children cannot create invitations or change household roles. Members may edit only permitted personal fields.
