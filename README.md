# Thirdwheel

A real-time, one-to-one chat application built with React and Firebase.

## Features

- Email and password authentication
- User registration with a profile avatar
- Real-time conversation and message updates with Firestore
- Image attachments stored in Firebase Storage
- Conversation previews and latest-message timestamps

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

For a production deployment, review and deploy restrictive Firestore and Storage security rules. Do not rely on client-side checks as a substitute for Firebase Security Rules.

### Run locally

```bash
npm start
```

The development server runs at [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
```

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
- Automated tests and a dedicated error-monitoring flow are not yet implemented.
- Firebase security rules and deployment configuration should be reviewed before production use.

## License

No license has been specified yet. Contact the repository owner before reusing or distributing this project.
