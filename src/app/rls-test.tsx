import { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Profile = {
  full_name: string;
  role: 'admin' | 'reviewer' | 'encoder' | 'viewer';
};

export default function RLSTestScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchProfile(currentUser.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const addLog = (message: string) => {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev,
    ]);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single();

    if (error) {
      addLog(`Profile fetch error: ${error.message}`);
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
    addLog(`Role detected: ${data.role}`);
  };

  const handleLogin = async () => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      addLog(`Login failed: ${error.message}`);
    } else {
      addLog(`Logged in as ${data.user.email}`);

      if (data.user) {
        await fetchProfile(data.user.id);
      }
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      addLog(`Logout error: ${error.message}`);
    } else {
      setProfile(null);
      addLog('Logged out');
    }

    setLoading(false);
  };

  const fetchBranches = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      addLog(`Fetch branches BLOCKED/ERROR: ${error.message}`);
    } else {
      addLog(`Fetch branches SUCCESS: ${JSON.stringify(data, null, 2)}`);
    }

    setLoading(false);
  };

  const createBranch = async () => {
    if (!user) {
      addLog('You must log in first.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('branches')
      .insert({
        name: `RLS Test Branch ${Date.now()}`,
        description: 'Temporary branch created for RLS testing',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      addLog(`Create branch BLOCKED/ERROR: ${error.message}`);
    } else {
      addLog(`Create branch SUCCESS: ${JSON.stringify(data, null, 2)}`);
    }

    setLoading(false);
  };

  const updateLatestBranch = async () => {
    setLoading(true);

    const { data: branches, error: fetchError } = await supabase
      .from('branches')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      addLog(`Could not find branch: ${fetchError.message}`);
      setLoading(false);
      return;
    }

    if (!branches || branches.length === 0) {
      addLog('No branch exists to update.');
      setLoading(false);
      return;
    }

    const branch = branches[0];

    const { data, error } = await supabase
      .from('branches')
      .update({
        description: `Updated during RLS test at ${new Date().toISOString()}`,
      })
      .eq('id', branch.id)
      .select();

    if (error) {
      addLog(`Update branch BLOCKED/ERROR: ${error.message}`);
    } else if (!data || data.length === 0) {
      addLog('Update branch BLOCKED: RLS allowed 0 rows to be updated.');
    } else {
      addLog(`Update branch SUCCESS: ${JSON.stringify(data, null, 2)}`);
    }

    setLoading(false);
  };

  const createSection = async () => {
    if (!user) {
      addLog('You must log in first.');
      return;
    }

    setLoading(true);

    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);

    if (branchError) {
      addLog(`Could not fetch branch: ${branchError.message}`);
      setLoading(false);
      return;
    }

    if (!branches || branches.length === 0) {
      addLog('No branch exists. Create a branch first.');
      setLoading(false);
      return;
    }

    const branch = branches[0];

    const { data, error } = await supabase
      .from('sections')
      .insert({
        branch_id: branch.id,
        name: `RLS Test Section ${Date.now()}`,
        description: 'Temporary section created for RLS testing',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      addLog(`Create section BLOCKED/ERROR: ${error.message}`);
    } else {
      addLog(`Create section SUCCESS: ${JSON.stringify(data, null, 2)}`);
    }

    setLoading(false);
  };

  const deleteLatestTestBranch = async () => {
    setLoading(true);

    const { data: branches, error: fetchError } = await supabase
      .from('branches')
      .select('id, name')
      .ilike('name', 'RLS Test Branch%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      addLog(`Could not find test branch: ${fetchError.message}`);
      setLoading(false);
      return;
    }

    if (!branches || branches.length === 0) {
      addLog('No RLS test branch exists to delete.');
      setLoading(false);
      return;
    }

    const branch = branches[0];

    const { data, error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branch.id)
      .select('id, name');

    if (error) {
      addLog(`Delete branch BLOCKED/ERROR: ${error.message}`);
    } else if (!data || data.length === 0) {
      addLog('Delete branch BLOCKED: RLS allowed 0 rows to be deleted.');
    } else {
      addLog(`Delete branch SUCCESS: ${branch.name}`);
    }

    setLoading(false);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>PCI System — RLS Test</Text>

      {user ? (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Current Account</Text>
          <Text>Email: {user.email}</Text>
          <Text>
            Role:{' '}
            <Text style={styles.roleText}>
              {profile?.role ?? 'Loading...'}
            </Text>
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.logoutButton]}
            onPress={handleLogout}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Login</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.subtitle}>RLS Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={fetchBranches}
          disabled={loading}
        >
          <Text style={styles.buttonText}>1. Fetch Branches</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={createBranch}
          disabled={loading}
        >
          <Text style={styles.buttonText}>2. Create Branch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={updateLatestBranch}
          disabled={loading}
        >
          <Text style={styles.buttonText}>3. Update Latest Branch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={createSection}
          disabled={loading}
        >
          <Text style={styles.buttonText}>4. Create Section</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={deleteLatestTestBranch}
          disabled={loading}
        >
          <Text style={styles.buttonText}>5. Delete Test Branch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={clearLogs}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator size="large" style={styles.loader} />
      )}

      <View style={styles.logsContainer}>
        <Text style={styles.subtitle}>Logs</Text>

        {logs.length === 0 ? (
          <Text style={styles.emptyLogs}>No tests performed yet.</Text>
        ) : (
          logs.map((log, index) => (
            <Text key={`${index}-${log}`} style={styles.logText}>
              {log}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  roleText: {
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
  },
  actionButton: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#FF9500',
  },
  clearButton: {
    backgroundColor: '#8E8E93',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 10,
  },
  logsContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    minHeight: 180,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 8,
    color: '#333',
  },
  emptyLogs: {
    color: '#777',
  },
});