# Dating data model and privacy contract (Phase 0)

This document defines the first versioned contract for dating profile data. It is deliberately additive: existing public profile fields and existing chat records remain readable. No existing user data is migrated by this phase.

## Collections and visibility

| Data | Proposed location | Client visibility | Notes |
|---|---|---|---|
| Public dating profile | `publicProfiles/{uid}` | Signed-in users, subject to discoverability | Display name, avatar, city/region, chosen interests, relationship intent, selected prompt answers |
| Private preferences | `users/{uid}/privatePreferences/dating` | Owner only | Discovery preferences, filters, dealbreakers; never copied to public profile |
| Likes | `users/{uid}/likes/{targetUid}` | Owner only | A like is private until mutual match |
| Match record | `matches/{matchId}` | Matched participants only | Server-authoritative lifecycle and participant list |
| Match conversation | `matches/{matchId}/messages/{messageId}` | Matched participants only | Proposed target model; migration required before cutover |
| Reports | `reports/{reportId}` | Client create only | Client cannot read, update or delete |
| Moderation records | `moderationCases/{caseId}` | Trusted server/admin only | Never readable or writable by ordinary clients |
| Audit events | `moderationAudit/{eventId}` | Trusted server/admin only | Append-only operational audit |

## Public profile field policy

- Public only when deliberately shared: display name, avatar, city/region, interests, relationship intention and selected prompt answers.
- Private by default: date of birth, age-assurance evidence, email, phone, exact location, discovery preferences, dealbreakers, likes, passes, report history and moderation data.
- Never place date of birth, identity documents, exact coordinates, private preferences or moderation notes in `publicProfiles`.
- Age eligibility is an account gate, not a public profile attribute. Do not claim verification until an approved age-assurance provider is integrated.
- City is coarse location only. Do not derive or expose distance from exact coordinates in this version.

## Match lifecycle

```
pending -> matched -> unmatched
   |          |
   +-> blocked <---+
   +-> reported
              matched -> suspended -> deleted
```

The diagram is a vocabulary, not permission for clients to set arbitrary states. Mutual match creation and all terminal/safety transitions must be enforced by trusted server logic and security rules. A block always overrides a match and disables messaging. A report does not itself prove misconduct or automatically suspend an account.

## Compatibility and migration

- Version 1 dating fields are optional and additive.
- Existing profiles without dating fields remain valid and are not automatically exposed as eligible dating profiles.
- Existing chat documents remain unchanged until a migration is rehearsed and verified.
- The new dating experience must fail closed: missing adult eligibility or missing mutual-match state means no dating discovery or new dating conversation.
- Migrations require a backup, dry run, count reconciliation, idempotency, rollback plan and explicit owner approval.

## Retention and deletion requirements

Before launch, define retention periods for likes, unmatched conversations, reports, moderation evidence and audit records. Account deletion must remove or de-identify user-owned profile and media data where legally and operationally appropriate, while retaining only records that must be preserved for safety, legal or fraud-prevention reasons under a documented policy. This contract does not invent retention periods; they require product/legal approval.
