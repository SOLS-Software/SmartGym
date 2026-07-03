import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@smartgym:client_id';

export function useCurrentClient() {
  const [clientId, setClientId] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadClientId() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setClientId(Number(stored));
        }
      } catch (error) {
        console.warn('Erro ao ler AsyncStorage:', error);
      } finally {
        setIsLoaded(true);
      }
    }

    void loadClientId();
  }, []);

  async function setCurrentClient(id: number | null) {
    try {
      if (id === null) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setClientId(null);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY, String(id));
        setClientId(id);
      }
    } catch (error) {
      console.error('Erro ao salvar clientId:', error);
    }
  }

  async function clearClient() {
    await setCurrentClient(null);
  }

  return {
    clientId,
    isLoaded,
    setCurrentClient,
    clearClient,
  };
}
