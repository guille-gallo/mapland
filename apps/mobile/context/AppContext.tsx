import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { locationBroadcast, type UserInfo } from '../services/locationBroadcast'
import { messagingService, type ChatMessage } from '../services/messaging'

const USER_INFO_KEY = 'mapland:user-info'

interface AppContextValue {
  userInfo: UserInfo | null
  isInitialized: boolean
  // Chat messages for the session
  messages: ChatMessage[]
  /** Returns true if message was added, false if duplicate */
  addMessage: (message: ChatMessage) => boolean
  clearMessages: () => void
  unreadCount: number
  markAsRead: () => void
  // Notification flag - once dismissed, no more notifications this session
  hasShownNotification: boolean
  setHasShownNotification: (value: boolean) => void
}

const AppContext = createContext<AppContextValue>({
  userInfo: null,
  isInitialized: false,
  messages: [],
  addMessage: () => false,
  clearMessages: () => {},
  unreadCount: 0,
  markAsRead: () => {},
  hasShownNotification: false,
  setHasShownNotification: () => {},
})

export function useAppContext() {
  return useContext(AppContext)
}

interface AppProviderProps {
  children: ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasShownNotification, setHasShownNotification] = useState(false)
  const messageIdsRef = useRef<Set<string>>(new Set())

  const addMessage = useCallback((message: ChatMessage): boolean => {
    // Deduplicate by message ID using ref for synchronous check
    if (messageIdsRef.current.has(message.id)) {
      return false
    }
    messageIdsRef.current.add(message.id)
    
    setMessages(prev => [...prev, message])
    
    // Only count incoming messages from backoffice as unread
    if (message.sender.type === 'backoffice') {
      setUnreadCount(prev => prev + 1)
    }
    return true
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setUnreadCount(0)
    messageIdsRef.current.clear()
  }, [])

  const markAsRead = useCallback(() => {
    setUnreadCount(0)
  }, [])

  useEffect(() => {
    initializeApp()

    return () => {
      // Cleanup on app close
      locationBroadcast.disconnect()
      messagingService.disconnect()
    }
  }, [])

  const initializeApp = async () => {
    try {
      // Load or create user info
      let info = await loadUserInfo()
      
      if (!info) {
        info = await createUserInfo()
        await saveUserInfo(info)
      }

      setUserInfo(info)

      // Initialize services
      await locationBroadcast.initialize(info)
      await messagingService.initialize(info.userId, info.displayName)

      setIsInitialized(true)
    } catch (error) {
      console.error('App initialization error:', error)
      setIsInitialized(true) // Continue anyway
    }
  }

  return (
    <AppContext.Provider value={{ 
      userInfo, 
      isInitialized, 
      messages, 
      addMessage, 
      clearMessages,
      unreadCount,
      markAsRead,
      hasShownNotification,
      setHasShownNotification,
    }}>
      {children}
    </AppContext.Provider>
  )
}

// Helper functions for user info persistence

async function loadUserInfo(): Promise<UserInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_INFO_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch (error) {
    console.warn('Failed to load user info:', error)
  }
  return null
}

async function saveUserInfo(userInfo: UserInfo): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo))
  } catch (error) {
    console.warn('Failed to save user info:', error)
  }
}

async function createUserInfo(): Promise<UserInfo> {
  // Generate unique device ID
  const deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  // Get device name for display
  const deviceName = Device.deviceName || `${Platform.OS} Device`
  
  return {
    userId: deviceId,
    displayName: deviceName,
    deviceType: Platform.OS as 'ios' | 'android',
  }
}
