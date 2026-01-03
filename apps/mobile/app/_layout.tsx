import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { locationBroadcast, type UserInfo } from '../services/locationBroadcast'

const USER_INFO_KEY = 'mapland:user-info'

export default function RootLayout() {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    initializeApp()

    return () => {
      // Cleanup on app close
      locationBroadcast.disconnect()
    }
  }, [])

  const initializeApp = async () => {
    try {
      // Load or create user info
      let userInfo = await loadUserInfo()
      
      if (!userInfo) {
        userInfo = await createUserInfo()
        await saveUserInfo(userInfo)
      }

      // Initialize broadcast service
      await locationBroadcast.initialize(userInfo)

      setIsInitialized(true)
    } catch (error) {
      console.error('App initialization error:', error)
      setIsInitialized(true) // Continue anyway
    }
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#3b82f6',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Mapland',
            headerRight: () => null, // Will add settings button
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
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
