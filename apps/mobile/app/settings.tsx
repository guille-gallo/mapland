import { useState, useEffect } from 'react'
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  Switch,
  ScrollView,
  Alert 
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { locationBroadcast, type UserInfo } from '../services/locationBroadcast'
import { zonesApi } from '../services/zonesApi'

const USER_INFO_KEY = 'mapland:user-info'

export default function SettingsScreen() {
  const router = useRouter()
  
  const [displayName, setDisplayName] = useState('')
  const [isBroadcasting, setIsBroadcasting] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem(USER_INFO_KEY)
      if (raw) {
        const userInfo: UserInfo = JSON.parse(raw)
        setDisplayName(userInfo.displayName)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveDisplayName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name')
      return
    }

    setIsLoading(true)
    try {
      const raw = await AsyncStorage.getItem(USER_INFO_KEY)
      if (raw) {
        const userInfo: UserInfo = JSON.parse(raw)
        userInfo.displayName = displayName.trim()
        await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo))
        
        // Reconnect with new name
        await locationBroadcast.disconnect()
        await locationBroadcast.initialize(userInfo)
        
        Alert.alert('Success', 'Display name updated!')
      }
    } catch (error) {
      console.error('Failed to save display name:', error)
      Alert.alert('Error', 'Failed to save settings')
    } finally {
      setIsLoading(false)
    }
  }

  const refreshZones = async () => {
    setIsLoading(true)
    try {
      await zonesApi.fetchZones(true)
      Alert.alert('Success', 'Zones refreshed!')
    } catch (error) {
      console.error('Failed to refresh zones:', error)
      Alert.alert('Error', 'Failed to refresh zones')
    } finally {
      setIsLoading(false)
    }
  }

  const clearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true)
            try {
              await zonesApi.clearCache()
              Alert.alert('Success', 'Cache cleared!')
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache')
            } finally {
              setIsLoading(false)
            }
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={styles.container}>
      {/* User Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Profile</Text>
        
        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity 
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={saveDisplayName}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Save Name</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tracking Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location Tracking</Text>
        
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Broadcast Location</Text>
            <Text style={styles.hint}>Share your location with operators</Text>
          </View>
          <Switch
            value={isBroadcasting}
            onValueChange={setIsBroadcasting}
            trackColor={{ false: '#cbd5e1', true: '#3b82f6' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Status</Text>
          <Text style={styles.infoText}>
            Connected: {locationBroadcast.getIsConnected() ? '✅ Yes' : '❌ No'}
          </Text>
          <Text style={styles.infoText}>
            Status: {locationBroadcast.getStatus().toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Data Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        
        <TouchableOpacity 
          style={[styles.button, styles.buttonSecondary, isLoading && styles.buttonDisabled]}
          onPress={refreshZones}
          disabled={isLoading}
        >
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>🔄 Refresh Zones</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.buttonDanger, isLoading && styles.buttonDisabled]}
          onPress={clearCache}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🗑️ Clear Cache</Text>
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.infoText}>Mapland Mobile v1.0.0</Text>
        <Text style={styles.hint}>Zone geofencing with real-time tracking</Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#475569',
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
  },
  spacer: {
    height: 40,
  },
})
