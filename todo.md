# TopTier Chat - Project TODO

## Core Features

### Authentication & User Management
- [x] Google OAuth integration
- [x] Email/Password signup with email verification code
- [x] Email verification flow (send code, verify code)
- [x] Session management and logout
- [ ] Password reset functionality

### User Profiles
- [x] Create profile with @handle and display name
- [x] Edit profile (handle, display name, bio, avatar)
- [x] Karma system initialization
- [x] Profile view page with user info
- [x] Handle availability checking

### Friends System
- [x] Send friend requests
- [x] Accept/reject friend requests
- [x] View friends list
- [x] View pending friend requests
- [x] Remove friends
- [ ] Friend request notifications

### Direct Messaging
- [x] Send text messages
- [ ] Real-time message delivery
- [x] Message history loading
- [ ] Typing indicators
- [ ] Online/offline status
- [x] Mark messages as read
- [x] Delete messages

### Photo Sharing (Karma-Gated)
- [x] Karma requirement system (default: 10 karma to share photos)
- [ ] Photo upload to S3
- [x] Send photos in direct messages
- [x] Photo sharing permission checks
- [x] Photo viewing in messages

### Group Chats
- [x] Create group chat
- [x] Add/remove members
- [x] Group messaging
- [x] Group photo sharing
- [x] Group member list
- [x] Leave group
- [x] Delete group (admin only)
- [ ] Group typing indicators

### Real-Time Features
- [ ] WebSocket connection setup
- [ ] Typing indicators in DMs and groups
- [ ] Online status updates
- [ ] Real-time message delivery
- [ ] Connection status indicator

### UI/UX
- [x] Landing/login page
- [x] Chat list view (DMs and groups)
- [x] Direct message chat interface
- [x] Group chat interface
- [x] Friends list view
- [ ] Friend requests view
- [x] Profile settings page
- [ ] Mobile responsive design (in progress)
- [ ] Dark/light theme support
- [x] Empty states and loading states
- [x] Error handling and user feedback

### Mobile Responsiveness
- [ ] Mobile-first layout
- [ ] Touch-friendly buttons and interactions
- [ ] Responsive navigation
- [ ] Mobile chat interface
- [ ] Mobile profile management

## Database
- [x] Schema design and migration
- [x] Users table with auth fields
- [x] Profiles table with handle and karma
- [x] Friend requests table
- [x] Direct messages table
- [x] Groups and group members tables
- [x] Group messages table
- [x] Online status table
- [x] Typing indicators table

## Backend APIs (tRPC Procedures)
- [x] Authentication procedures
- [x] Profile procedures (create, update, get)
- [x] Friend procedures (send, accept, reject, list)
- [x] Direct message procedures (send, get, delete)
- [x] Group procedures (create, update, delete, members)
- [x] Group message procedures
- [ ] Online status procedures
- [ ] Typing indicator procedures
- [ ] Karma update procedures

## Testing
- [ ] Unit tests for auth logic
- [ ] Unit tests for karma system
- [ ] Integration tests for messaging
- [ ] E2E tests for key flows

## Deployment
- [ ] Environment variables configured
- [ ] Database connected
- [ ] S3 storage configured
- [ ] Email service configured
- [ ] Ready for production
