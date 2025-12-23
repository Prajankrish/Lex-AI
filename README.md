# LEXAI - AI Legal Assistant

An intelligent legal query chatbot powered by local AI models, specialized in Indian Law, Constitution, and IPC sections. LEXAI provides instant answers to legal questions with built-in authentication and an intuitive chat interface.

## 🎯 Features

- **Legal Query Chatbot**: Ask questions about Indian Constitution, IPC, and legal procedures
- **Local AI Powered**: Uses Ollama for privacy-preserving local model inference
- **Semantic Search**: RAG (Retrieval-Augmented Generation) for accurate legal information
- **Authentication System**: Supports demo mode, email, and Google OAuth
- **Real-time Chat**: Interactive conversation interface with markdown support
- **User Sessions**: Persistent chat history management
- **Responsive Design**: Modern UI built with React and Tailwind CSS

## 🏗️ Architecture

### Frontend
- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS with custom theme
- **Build Tool**: Vite
- **Components**: Modular component-based architecture
  - Chat interface with message rendering
  - Sidebar for session management
  - Login/authentication flows
  - User profile management

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite for user sessions and chat history
- **LLM**: Ollama for local model inference
- **Search**: FAISS (Facebook AI Similarity Search) for vector similarity
- **Auth**: JWT tokens with multiple providers (Google OAuth, Email)
- **API**: RESTful endpoints with CORS support

### Database
- User authentication and profiles
- Chat sessions and messages
- Message metadata (timestamps, user references)

## 📋 Requirements

### Backend Requirements
```
Python 3.8+
FastAPI 0.110.0
Ollama (for local LLM)
SQLite3
```

### Frontend Requirements
```
Node.js 18+
npm or yarn
```

### Optional Services
- Google OAuth (for authentication)
- Local Ollama instance (for LLM)

## 🚀 Quick Start

### 1. Setup Backend

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Set environment variables
export GOOGLE_CLIENT_ID="your_client_id"
export JWT_SECRET="your_secret_key"
export ENVIRONMENT="development"

# Run the backend server
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 2. Setup Frontend

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3001 in your browser
```

### 3. Authentication Setup

#### Option A: Demo Mode (No Setup Required)
- Backend already accepts demo logins
- Enter any email on the login page
- Click "Continue with Email" to login immediately

#### Option B: Google OAuth (Recommended)

1. Create a Google Cloud project:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create or select a project
   - Search for and enable "Google+ API"
   - Go to Credentials → Create OAuth 2.0 Client ID
   - Select "Web application"
   - Add `http://localhost:3001` to Authorized JavaScript origins

2. Update frontend:
   ```typescript
   // frontend/src/components/Login.tsx (Line ~40)
   client_id: 'YOUR_GOOGLE_CLIENT_ID',
   ```

3. Add Google script to HTML:
   ```html
   <!-- frontend/index.html -->
   <script src="https://accounts.google.com/gsi/client" async defer></script>
   ```

4. Test the login flow

#### Option C: Email + Password

The backend is ready for password authentication. Update the `auth_email` endpoint in `backend/app.py` to validate passwords using the included password hashing utilities.

## 🔌 API Endpoints

### Authentication
- `POST /auth/google` - Verify Google OAuth token
- `POST /auth/email` - Email authentication
- `POST /auth/logout` - User logout

### Chat
- `POST /chat` - Send message to LLM
- `GET /chat/sessions` - Get user's chat sessions
- `GET /chat/{session_id}` - Get messages from session
- `DELETE /chat/{session_id}` - Delete a session

### RAG (Retrieval-Augmented Generation)
- Built-in vector search for legal documents
- Automatic prompt augmentation with relevant context

## 📁 Project Structure

```
lexai/
├── backend/                    # Python FastAPI backend
│   ├── app.py                 # Main FastAPI application
│   ├── db.py                  # Database models and operations
│   ├── llm_service.py         # LLM inference service
│   ├── retriever.py           # RAG retriever logic
│   ├── requirements.txt        # Python dependencies
│   ├── lexai.sqlite3          # SQLite database
│   └── build_index/           # RAG index building utilities
│
├── frontend/                   # React TypeScript frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Profile.tsx
│   │   │   └── LiquidEther.tsx
│   │   ├── services/          # API and auth services
│   │   │   ├── api.ts
│   │   │   └── auth.ts
│   │   ├── App.tsx            # Main App component
│   │   ├── types.ts           # TypeScript type definitions
│   │   └── index.css          # Global styles
│   ├── index.html             # HTML entry point
│   ├── package.json           # Node dependencies
│   ├── tailwind.config.js     # Tailwind configuration
│   └── vite.config.ts         # Vite configuration
│
├── deploy/                    # Docker deployment
│   ├── docker-compose.yml     # Multi-container setup
│   └── nginx/                 # Nginx reverse proxy config
│
├── README.md                  # This file
├── QUICK_START.md             # Quick setup guide
├── AUTH_SETUP.md              # Detailed auth setup
└── metadata.json              # Project metadata
```

## 🔒 Authentication Flow

1. **Frontend**: User enters email or clicks "Continue with Google"
2. **Auth Service**: Sends credentials to backend
3. **Backend**: Validates credentials/tokens and generates JWT
4. **Token Storage**: JWT stored in localStorage
5. **API Requests**: JWT included in Authorization headers
6. **User State**: App maintains user context throughout session

## 🛠️ Development

### Start Development Servers

Terminal 1 - Backend:
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

Terminal 2 - Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Key Technologies Used

**Frontend**:
- React 19
- TypeScript 5.8
- Vite 6
- Tailwind CSS 3.4
- React Router 7
- React Markdown with syntax highlighting

**Backend**:
- FastAPI 0.110
- SQLAlchemy (SQLite ORM)
- Sentence Transformers (embeddings)
- FAISS (vector search)
- Ollama (local LLM)
- JWT & OAuth authentication

## 📦 Dependencies

### Backend Core
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `pydantic` - Data validation
- `sentence-transformers` - Text embeddings
- `faiss-cpu` - Vector similarity search
- `ollama` - Local LLM client

### Authentication
- `google-auth` - Google OAuth verification
- `python-jose` - JWT handling
- `passlib` - Password hashing
- `bcrypt` - Cryptographic hashing

### Frontend Core
- `react` - UI library
- `react-dom` - React DOM rendering
- `vite` - Build tool
- `typescript` - Type checking
- `tailwindcss` - Utility-first CSS

## 🚢 Deployment

### Docker Deployment
```bash
cd deploy
docker-compose up -d
```

Includes:
- Frontend (Nginx)
- Backend (FastAPI)
- Database (SQLite)
- Environment configuration

## 📝 Configuration

### Environment Variables

Backend (.env):
```
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret_key
ENVIRONMENT=production
OLLAMA_BASE_URL=http://localhost:11434  # Ollama server
```

Frontend (.env):
```
VITE_API_URL=http://localhost:8000
```

## 🔍 How It Works

### Chat Flow
1. User sends a message
2. Frontend sends query to backend API
3. Backend retrieves relevant legal documents using RAG
4. LLM generates response based on context
5. Response returned with source references
6. Frontend displays message with markdown formatting

### RAG (Retrieval-Augmented Generation)
1. Legal documents indexed with semantic embeddings
2. User query converted to embedding
3. Similar documents retrieved from vector database
4. Retrieved context added to LLM prompt
5. LLM generates informed response

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Change port in frontend (vite.config.ts) or backend (app.py)
```

### Ollama Connection Error
```bash
# Ensure Ollama is running: ollama serve
# Check OLLAMA_BASE_URL in backend/.env
```

### Google OAuth Not Working
```bash
# Verify Client ID in frontend/src/components/Login.tsx
# Check Google Cloud Console redirect URIs
```

### Database Locked
```bash
# Remove old connections: rm backend/lexai.sqlite3
# Database will be recreated on startup
```

## 📚 Documentation

- [QUICK_START.md](QUICK_START.md) - Quick setup guide
- [AUTH_SETUP.md](AUTH_SETUP.md) - Detailed authentication setup
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - Current feature status

## 🤝 Contributing

This is an active development project. Key areas for contribution:
- Authentication improvements
- Additional legal document sources
- UI/UX enhancements
- Performance optimizations
- Testing coverage

## 📄 License

[Add your license information here]

## 👨‍💼 Support

For issues, questions, or contributions, please refer to the documentation files or submit an issue.

---

**Last Updated**: December 2025
**Status**: Active Development
**Version**: 1.0.0
