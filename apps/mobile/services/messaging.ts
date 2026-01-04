import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Message types
 */
export type MessageType = 'text' | 'command'
export type SenderType = 'backoffice' | 'mobile'
export type CommandType = 'call_operator'

export interface ChatMessage {
  id: string
  type: MessageType
  content?: string
  command?: {
    type: CommandType
    data?: Record<string, string>
  }
  sender: {
    id: string
    name: string
    type: SenderType
  }
  recipientId: string
  timestamp: string
}

/** @deprecated Use ChatMessage */
export type DirectMessage = ChatMessage

/**
 * Default operator phone number
 */
export const OPERATOR_PHONE_NUMBER = '+1234567890'

/**
 * Channel for messages to a specific user
 */
export const getMessageChannel = (userId: string) => `mapland:messages:${userId}`

/**
 * Channel for messages to backoffice
 */
export const BACKOFFICE_CHANNEL = 'mapland:backoffice'

type MessageCallback = (message: ChatMessage) => void

/**
 * Service for bidirectional messaging
 */
class MessagingService {
  private channel: RealtimeChannel | null = null
  private backofficeChannel: RealtimeChannel | null = null
  private userId: string | null = null
  private userName: string | null = null
  private callbacks: Set<MessageCallback> = new Set()

  /**
   * Initialize messaging for a user
   */
  async initialize(userId: string, userName: string): Promise<void> {
    if (!supabase) {
      console.warn('[Messaging] Supabase not configured')
      return
    }

    // Cleanup existing subscription
    await this.disconnect()

    this.userId = userId
    this.userName = userName
    const channelName = getMessageChannel(userId)

    console.log('[Messaging] Subscribing to:', channelName)

    // Subscribe to receive messages
    this.channel = supabase.channel(channelName)

    this.channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      const message = payload as ChatMessage
      console.log('[Messaging] Received:', message)
      
      // Notify all callbacks
      this.callbacks.forEach(cb => cb(message))
    })

    await this.channel.subscribe((status) => {
      console.log('[Messaging] Subscription status:', status)
    })

    // Setup backoffice channel for sending
    this.backofficeChannel = supabase.channel(BACKOFFICE_CHANNEL)
    await this.backofficeChannel.subscribe()
  }

  /**
   * Send a message to backoffice
   */
  async sendMessage(content: string): Promise<ChatMessage | null> {
    if (!supabase || !this.backofficeChannel || !this.userId || !this.userName) {
      console.warn('[Messaging] Cannot send: not initialized')
      return null
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: 'text',
      content,
      sender: {
        id: this.userId,
        name: this.userName,
        type: 'mobile',
      },
      recipientId: 'backoffice',
      timestamp: new Date().toISOString(),
    }

    console.log('[Messaging] Sending to backoffice:', message)

    await this.backofficeChannel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    })

    return message
  }

  /**
   * Add a message listener
   */
  onMessage(callback: MessageCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  /**
   * Disconnect from messaging channel
   */
  async disconnect(): Promise<void> {
    if (supabase) {
      if (this.channel) {
        await supabase.removeChannel(this.channel)
        this.channel = null
      }
      if (this.backofficeChannel) {
        await supabase.removeChannel(this.backofficeChannel)
        this.backofficeChannel = null
      }
    }
    this.userId = null
    this.userName = null
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.userId
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.channel !== null
  }
}

export const messagingService = new MessagingService();