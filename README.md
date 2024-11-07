# Overview
Security Sketch is a collaborative investigation tool designed for security teams. It integrates with Timesketch by Google and provides a real-time chat interface with AI-powered analysis capabilities.

See the [Timesketch](https://github.com/google/timesketch) project for more information.

For installation instructions, see the [container_setup.md](container_setup.md) file.

## Quick Start

```
chmod +x container_setup
./container_setup setup-reset
```
* Make sure you have Docker and Docker Compose installed, as well as a .env file with the correct variables.

## Key Features
- Real-time collaborative chat rooms
- File upload and evidence processing
- Integration with Timesketch
- AI-powered security analysis
- Team management and access control
- Progressive Web App (PWA) support

## Architecture

### Frontend
- React-based SPA with Tailwind CSS
- Socket.IO for real-time communication
- PWA capabilities for offline access and mobile support

### Backend
- Node.js Express server
- PostgreSQL database
- Socket.IO for WebSocket connections
- Google's Generative AI integration
- File processing capabilities

### Database Schema
Key tables include:
- users
- rooms
- messages
- room_participants
- platform_settings
- uploaded_files