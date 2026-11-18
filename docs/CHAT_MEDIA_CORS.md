# Private chat media on Supabase Storage

Third Wheel uses two private Supabase Storage buckets:

- `avatars`: object path `{userUid}/{generatedFileName}`.
- `chat-images`: object path `{conversationId}/{senderUid}/{messageId}-{safeFileName}`.

The database stores only the object path in `profiles.photo_path` or `messages.attachment_path`. It never stores a long-lived bearer download URL. The browser requests a short-lived signed URL through the Supabase Storage SDK when rendering an image.

## Access controls

- Avatar reads are allowed only when the corresponding profile row is visible to the signed-in user (self, discoverable profile, blocked profile or existing conversation partner).
- Avatar writes, updates and deletes are restricted to the owner folder.
- Chat-image reads require membership in the conversation.
- Chat-image uploads and retry-safe updates require the uploader UID in the second path segment and membership in the conversation.
- Either-direction blocks prevent new image uploads and message writes.
- Buckets are private and limited to JPEG, PNG, WebP or GIF up to 5 MiB.

## Browser verification before release

- A signed-in owner can upload and read their avatar.
- A different signed-in user can read an avatar only when the profile is discoverable or they are connected through an existing conversation/owner block relationship.
- A conversation participant can upload/read the image object for that conversation.
- A nonparticipant and an unauthenticated caller cannot read the image, even if the object path is known.
- An uploader cannot write to another person's uploader path.
- Oversized files and unsupported MIME types are rejected.
- Retrying an ambiguous upload to the same path works without weakening owner/member authorization.
- The client revokes temporary signed URL/object references when message components unmount.

Supabase Storage is accessed through its HTTPS API. Do not add wildcard cross-origin settings or expose a public bucket to work around a browser error. Confirm the actual app origin and the project's current Storage/CORS configuration if a browser test fails.

## Current status

The two private buckets and the access policies are applied to the empty Supabase project. Frontend SDK upload/read code is wired to them. End-to-end browser tests still require a signed-in disposable account and an authorized localhost or hosted origin. No production files have been uploaded.
