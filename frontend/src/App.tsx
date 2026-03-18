import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import RegisterPage from './pages/RegisterPage'
import ScoringPage from './pages/ScoringPage'
import CompletionPage from './pages/CompletionPage'
import AdminPage from './pages/AdminPage'
import { useAuthStore } from './store/authStore'
import { authAPI } from './services/api'

function App() {
  const { token, isAuthenticated, user, setUser, logout } = useAuthStore()
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token && !user))

  useEffect(() => {
    document.title = '\u4e2a\u6027\u5316\u56fe\u50cf\u6807\u6ce8\u5e73\u53f0'
  }, [])

  useEffect(() => {
    const bootstrapUser = async () => {
      if (!token || user) {
        setIsBootstrapping(false)
        return
      }

      setIsBootstrapping(true)

      try {
        const currentUser = await authAPI.getCurrentUser()
        setUser(currentUser)
      } catch (error) {
        console.error('»Ö¸´µÇÂ¼×´Ì¬Ê§°Ü:', error)
        logout()
      } finally {
        setIsBootstrapping(false)
      }
    }

    bootstrapUser()
  }, [token, user, setUser, logout])

  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-lg text-gray-600">ÕýÔÚ»Ö¸´ÓÃ»§»á»°...</p>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={
            !isAuthenticated ? <RegisterPage /> :
            user?.completed ? <CompletionPage /> : <ScoringPage />
          } />
          <Route path="register" element={<RegisterPage />} />
          <Route path="scoring" element={
            isAuthenticated ? <ScoringPage /> : <Navigate to="/register" />
          } />
          <Route path="completion" element={
            isAuthenticated ? <CompletionPage /> : <Navigate to="/register" />
          } />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App