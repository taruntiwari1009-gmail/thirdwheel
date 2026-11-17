# Authenticated chat media reads

New chat messages store a Storage object path (for example `chat-images/{chatId}/{senderUid}/{messageId}-photo.png`) rather than a Firebase download URL containing a bearer token.

The client resolves that path with the Firebase Storage SDK's authenticated `getBlob()` read. Storage Rules authorize the request using the signed-in participant and the chat membership document. The browser receives a temporary object URL which is revoked when the message component unmounts.

## Browser CORS requirement

The Cloud Storage bucket must allow browser reads from the exact application origins used in development and staging. This is bucket configuration, not a Firebase Storage Rules change.

Create a CORS JSON file for the staging bucket, replacing the example origins with the actual origins approved for the environment:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "https://YOUR-STAGING-ORIGIN"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

Apply it only to the explicitly selected staging bucket:

```bash
gcloud storage buckets update gs://YOUR-STAGING-BUCKET --cors-file=cors.json
```

Do not apply this to production as part of PR #14. Confirm the bucket name and allowed origins with the project owner first. Do not use wildcard origins for authenticated private media.

## Verification checklist

- A signed-in participant can upload and read a chat image.
- A signed-in non-participant cannot read the object, even if they know its object path.
- An unauthenticated browser cannot read the object.
- A browser from an unapproved origin cannot read the object.
- A participant cannot write a message pointing at another user's uploader path.
- Newly created message documents contain an object path, not a tokenized download URL.
- Existing historical messages that contain a Firebase download URL are still interpreted as a Storage reference by the SDK; verify this compatibility in staging before rollout.
- Image load failures show a recoverable unavailable state rather than exposing a bearer URL fallback.

## Current status

The client-side authenticated SDK read, object-path writes and Firestore path validation are implemented on PR #14. Bucket CORS configuration and end-to-end browser verification remain staging tasks. No bucket configuration has been changed by this PR.
