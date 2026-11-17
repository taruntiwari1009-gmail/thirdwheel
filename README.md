# Thirdwheel

A real-time, one-to-one chat application built with React and Firebase.

## Features

- Email and password authentication
- User registration with a profile avatar
- Real-time conversation and message updates with Firestore
- Image attachments stored in Firebase Storage
- Conversation previews, unread counts and latest-message timestamps
- People discovery with profile previews and privacy-aware search
- Profile blocking and user reporting with Firestore-enforced message restrictions

## Tech stack

- React 18
- React Router
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Sass

## Getting started

### Prerequisites

- Node.js (LTS recommended)
- npm
- A Firebase project with Authentication, Cloud Firestore and Storage enabled

### Install dependencies

```bash
npm install
```

### Configure Firebase

The application currently initializes Firebase in `src/firebase.js`. Before running it against your own backend, configure that file with the settings for your Firebase project.

The repository includes version-controlled `firestore.rules`, `storage.rules` and `firebase.json`. These rules are designed for the current participant-based chat model. Do not deploy them to a live project until the application schema and existing data have been reviewed.

### Run Firebase security tests locally

The security test runner uses the Firebase Emulator Suite and Node.js built-in fetch; it does not require real Firebase credentials.

Prerequisites: Java 21 or later and Node.js matching `.nvmrc`.

```bash
npx --yes firebase-tools@14.22.0 emulators:exec --project demo-thirdwheel --only auth,firestore,storage "npm run test:rules"
```

The emulator tests cover authenticated profile access, participant-only conversation reads, message authorship, per-user conversation lists, profile blocking, report submission, avatar ownership, chat-media membership and image upload restrictions. They do not deploy rules or touch the configured Firebase project.

### Current Firestore model

- `publicProfiles/{uid}`: discoverable profile fields only (`uid`, `displayName`, `photoURL`). Email remains in Firebase Authentication; private per-user chat-list data is kept under `users/{uid}/userChats/{chatId}`.
- `chats/{chatId}`: two immutable participant UIDs and the current embedded `messages` array.
- `users/{uid}/userChats/{chatId}`: the user's conversation-list entry.
- `avatars/{uid}/{fileName}`: user-owned avatar objects.
- `chat-images/{chatId}/{uid}/{fileName}`: chat images scoped to a conversation and uploader.

Existing demo data from the older `userChats/{uid}` layout and chat documents without participant metadata is not automatically migrated. Use a fresh demo dataset or perform a separately reviewed migration before testing the new client against an existing Firebase project.

### Run locally

```bash
npm start
```

The development server runs at [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
```

## Project roadmap

The quality-first chat product roadmap, including phased delivery, safety requirements and release gates, is documented in [docs/DATING_PRODUCT_ROADMAP.md](docs/DATING_PRODUCT_ROADMAP.md).

## Project structure

```text
src/
  components/   Chat interface and reusable UI components
  context/      Authentication and selected-chat state
  pages/        Login, registration and home screens
  img/          Interface assets
  firebase.js   Firebase client initialization
  App.js        Application routes
```

## Important security note

Firebase client configuration is not an authorization boundary. Configure Firebase Authentication providers and enforce access through Firestore and Storage Security Rules. Never commit service-account credentials, private keys or other server-side secrets.

## Current limitations

- The application is designed around one-to-one conversations.
- Blocking is enforced for new conversation creation and message writes; report submissions are write-only from the client and require an operational review process outside the app.
- Firebase rules are versioned and emulator tests are part of CI, but production rule deployment has not been performed.
- Messages are still stored in an embedded array; bounded pagination and the message-subcollection migration remain future work.
- Firebase Storage download URLs are bearer links; do not treat tokenized URLs as confidential media access.

## License

No license has been specified yet. Contact the repository owner before reusing or distributing this project.
