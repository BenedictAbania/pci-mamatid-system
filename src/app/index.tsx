import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const router = useRouter();

  const [status, setStatus] = useState('Testing Supabase connection...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();
  }, []);

  async function testConnection() {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .limit(1);

      if (error) {
        console.error('Supabase error:', error);
        setStatus(`❌ Supabase error: ${error.message}`);
        return;
      }

      console.log('Supabase response:', data);

      setStatus('✅ Expo is connected to Supabase!');
    } catch (error) {
      console.error(error);

      setStatus(
        `❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator size="large" />}

      <Text style={styles.title}>PCI Mamatid System</Text>

      <Text style={styles.status}>{status}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/rls-test')}
      >
        <Text style={styles.buttonText}>Go to RLS Test Screen</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },

  status: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },

  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },

  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});