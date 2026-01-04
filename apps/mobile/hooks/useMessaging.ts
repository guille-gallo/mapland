import { useEffect, useState, useCallback, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import Constants from 'expo-constants'
import { 
  messagingService, 
  OPERATOR_PHONE_NUMBER,
  type ChatMessage 
} from '../services/messaging'
import { useAppContext } from '../context/AppContext'

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo'

// Lazy-load notifications only in dev builds (not Expo Go)
let Notifications: typeof import('expo-notifications') | null = null
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications')
  } catch (e) {
    console.warn('expo-notifications not available in useMessaging')
  }
}

interface UseMessagingOptions {
  userId: string | null
  enabled?: boolean
}

interface UseMessagingReturn {
  /** Latest message received */
  lastMessage: ChatMessage | null
  /** All messages in current session */
  messages: ChatMessage[]
  /** Is the messaging channel connected */
  isConnected: boolean
  /** Send a message to backoffice */
  sendMessage: (content: string) => Promise<void>
  /** Clear messages */
  clearMessages: () => void
  /** Unread count (messages from BO not yet seen) */
  unreadCount: number
  /** Mark all as read */
  markAsRead: () => void
}

/**
 * Hook for bidirectional messaging with backoffice
 */
export function useMessaging(options: UseMessagingOptions): UseMessagingReturn {
  const { userId, enabled = true } = options
  
  const { 
    messages, 
    addMessage, 
    clearMessages, 
    unreadCount, 
    markAsRead,
    hasShownNotification,
    setHasShownNotification,
  } = useAppContext()
  const [lastMessage, setLastMessage] = useState<ChatMessage | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const handleMessage = useCallback((message: ChatMessage) => {
    const isNew = addMessage(message)
    
    // Skip notifications for duplicate messages
    if (!isNew) return
    
    setLastMessage(message)

    // Handle incoming messages from backoffice
    if (message.sender.type === 'backoffice') {
      if (message.type === 'command' && message.command) {
        // Commands always show alert dialogs
        handleCommand(message)
      } else if (message.type === 'text' && !hasShownNotification) {
        // Text messages show notification only once per session
        showMessageNotification(message.sender.name)
        setHasShownNotification(true)
      }
    }
  }, [addMessage, hasShownNotification, setHasShownNotification])

  const showMessageNotification = useCallback(async (senderName: string) => {
    const title = '💬 New Message'
    const body = `You have a new message from ${senderName}`

    if (Notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null, // Immediate
      })
    } else {
      // Fallback for Expo Go - simple alert
      Alert.alert(title, body)
    }
  }, [])

  const handleCommand = useCallback((message: ChatMessage) => {
    if (!message.command) return

    switch (message.command.type) {
      case 'call_operator':
        const phoneNumber = message.command.data?.phoneNumber || OPERATOR_PHONE_NUMBER
        Alert.alert(
          '📞 Call Requested',
          `${message.sender.name} is requesting you to call the operator.`,
          [
            { text: 'Later', style: 'cancel' },
            { 
              text: 'Call Now', 
              onPress: async () => {
                const phoneUrl = `tel:${phoneNumber}`
                try {
                  // Try to open directly - canOpenURL can return false even when it works
                  await Linking.openURL(phoneUrl)
                } catch (error) {
                  console.error('Phone call error:', error)
                  Alert.alert(
                    'Unable to Call',
                    `Please call ${phoneNumber} manually.`,
                    [{ text: 'OK' }]
                  )
                }
              }
            },
          ]
        )
        break

      default:
        console.warn('[Messaging] Unknown command type:', message.command.type)
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return
    
    const message = await messagingService.sendMessage(content.trim())
    if (message) {
      // Add our own message to the list
      addMessage(message)
    }
  }, [addMessage])

  // Subscribe to incoming messages
  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false)
      return
    }

    setIsConnected(messagingService.isConnected())

    const unsubscribe = messagingService.onMessage(handleMessage)

    return () => {
      unsubscribe()
    }
  }, [userId, enabled, handleMessage])

  return {
    lastMessage,
    messages,
    isConnected,
    sendMessage,
    clearMessages,
    unreadCount,
    markAsRead,
  }
}
