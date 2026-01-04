import { useState, useCallback, useEffect, useRef } from 'react'
import type { TrackedUser } from '../types/realtime'
import { supabase } from '../services/supabase'
import { 
  getMessageChannel, 
  OPERATOR_PHONE_NUMBER,
  BACKOFFICE_CHANNEL,
  type ChatMessage 
} from '../types/realtime'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UserPanelProps {
  user: TrackedUser | null
  onClose: () => void
}

export default function UserPanel({ user, onClose }: UserPanelProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [showChat, setShowChat] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to backoffice channel for incoming messages
  useEffect(() => {
    if (!supabase || !user) return

    const channel = supabase.channel(BACKOFFICE_CHANNEL)
    
    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      const msg = payload as ChatMessage
      // Only show messages from this user
      if (msg.sender.id === user.user.userId) {
        setMessages(prev => [...prev, msg])
        // Auto-open chat when message received
        setShowChat(true)
      }
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.user.userId])

  // Clear messages when switching users
  useEffect(() => {
    setMessages([])
    setShowChat(false)
  }, [user?.user.userId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (type: 'text' | 'command') => {
    if (!user || !supabase) return
    if (type === 'text' && !message.trim()) return
    
    setSending(true)

    try {
      const channel = supabase.channel(getMessageChannel(user.user.userId))
      await channel.subscribe()

      const payload: ChatMessage = {
        id: crypto.randomUUID(),
        type,
        recipientId: user.user.userId,
        sender: {
          id: 'backoffice',
          name: 'Operator',
          type: 'backoffice',
        },
        timestamp: new Date().toISOString(),
        ...(type === 'text' 
          ? { content: message.trim() }
          : { 
              command: { 
                type: 'call_operator',
                data: { phoneNumber: OPERATOR_PHONE_NUMBER }
              } 
            }
        ),
      }

      await channel.send({
        type: 'broadcast',
        event: 'message',
        payload,
      })

      await supabase.removeChannel(channel)

      setMessages(prev => [...prev, payload])
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }, [user, message])

  if (!user) return null

  const timeSinceUpdate = Math.round((Date.now() - user.lastSeen.getTime()) / 1000)
  const statusColor = user.status === 'sos' 
    ? '#ef4444' 
    : user.status === 'active' 
      ? '#22c55e' 
      : '#f59e0b'

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.userInfo}>
          <div style={styles.avatar}>
            {user.user.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style={styles.name}>{user.user.displayName}</h3>
            <div style={styles.meta}>
              <span style={{ ...styles.statusBadge, background: statusColor }}>
                {user.status.toUpperCase()}
              </span>
              <span style={styles.lastSeen}>
                {timeSinceUpdate < 60 
                  ? `${timeSinceUpdate}s ago` 
                  : `${Math.round(timeSinceUpdate / 60)}m ago`}
              </span>
            </div>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Tab buttons */}
      <div style={styles.tabs}>
        <button 
          style={{
            ...styles.tabBtn,
            ...(showChat ? {} : styles.tabBtnActive),
          }}
          onClick={() => setShowChat(false)}
        >
          📍 Info
        </button>
        <button 
          style={{
            ...styles.tabBtn,
            ...(showChat ? styles.tabBtnActive : {}),
          }}
          onClick={() => setShowChat(true)}
        >
          💬 Chat {messages.length > 0 && `(${messages.length})`}
        </button>
      </div>

      {!showChat ? (
        /* Info View */
        <>
          {/* Location Info */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Location</div>
            <div style={styles.coords}>
              {user.position.latitude.toFixed(6)}, {user.position.longitude.toFixed(6)}
            </div>
            {user.position.accuracy && (
              <div style={styles.accuracy}>
                ±{Math.round(user.position.accuracy)}m accuracy
              </div>
            )}
            {user.currentZones && user.currentZones.length > 0 && (
              <div style={styles.zones}>
                📍 In: {user.currentZones.map(z => z.name).join(', ')}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Quick Actions</div>
            <div style={styles.actionButtons}>
              <button 
                style={styles.actionBtn}
                onClick={() => {
                  setShowChat(true)
                }}
              >
                💬 Message
              </button>
              <button 
                style={styles.actionBtn}
                onClick={() => sendMessage('command')}
                disabled={sending}
              >
                📞 Call Request
              </button>
            </div>
          </div>

          {/* Device Info */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Device</div>
            <div style={styles.deviceInfo}>
              {user.user.deviceType === 'ios' && '🍎 '}
              {user.user.deviceType === 'android' && '🤖 '}
              {user.user.deviceType || 'Unknown'} • {user.user.userId.slice(0, 8)}...
            </div>
          </div>
        </>
      ) : (
        /* Chat View */
        <>
          <div style={styles.chatContainer}>
            {messages.length === 0 ? (
              <div style={styles.emptyChat}>
                <span style={styles.emptyChatIcon}>💬</span>
                <p>No messages yet</p>
                <p style={styles.emptyChatHint}>Send a message to start the conversation</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div 
                  key={msg.id} 
                  style={{
                    ...styles.chatBubble,
                    ...(msg.sender.type === 'backoffice' 
                      ? styles.chatBubbleMine 
                      : styles.chatBubbleTheirs),
                  }}
                >
                  {msg.type === 'command' ? (
                    <span>📞 Call request sent</span>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                  <div style={{
                    ...styles.chatTime,
                    ...(msg.sender.type === 'backoffice' ? styles.chatTimeMine : {}),
                  }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Message Input */}
          <div style={styles.chatInput}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              style={styles.input}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && message.trim()) {
                  sendMessage('text')
                }
              }}
            />
            <button 
              style={{
                ...styles.sendBtn,
                opacity: !message.trim() || sending ? 0.5 : 1,
              }}
              onClick={() => sendMessage('text')}
              disabled={!message.trim() || sending}
            >
              ➤
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 60,
    right: 10,
    width: 340,
    maxHeight: 'calc(100vh - 80px)',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 1000,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  userInfo: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#3b82f6',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 600,
  },
  name: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#1e293b',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    color: '#fff',
  },
  lastSeen: {
    fontSize: 12,
    color: '#64748b',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 4,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    background: 'none',
    fontSize: 13,
    fontWeight: 500,
    color: '#64748b',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabBtnActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6',
  },
  section: {
    padding: 16,
    borderBottom: '1px solid #f1f5f9',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 8,
    letterSpacing: '0.5px',
  },
  coords: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'monospace',
  },
  accuracy: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  zones: {
    fontSize: 13,
    color: '#3b82f6',
    marginTop: 8,
  },
  actionButtons: {
    display: 'flex',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  deviceInfo: {
    fontSize: 13,
    color: '#64748b',
  },
  chatContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 200,
    maxHeight: 300,
  },
  emptyChat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#94a3b8',
    textAlign: 'center',
  },
  emptyChatIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyChatHint: {
    fontSize: 12,
    marginTop: 4,
  },
  chatBubble: {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 1.4,
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    background: '#3b82f6',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  chatBubbleTheirs: {
    alignSelf: 'flex-start',
    background: '#f1f5f9',
    color: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  chatTime: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
  },
  chatTimeMine: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  chatInput: {
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '1px solid #e2e8f0',
    background: '#fff',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
  },
  sendBtn: {
    width: 40,
    height: 36,
    border: 'none',
    borderRadius: 8,
    background: '#3b82f6',
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
  },
}
