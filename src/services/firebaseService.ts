import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  setDoc,
  getDoc,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { auth, firestore, withRetry } from '@/lib/firebase';
import { cacheManager } from './cacheManager';

export interface Reminder {
  id: string;
  title: string;
  time: string;
  days: string[];
  type: 'medication' | 'checkup';
  completed: boolean;
  userId: string;
  createdAt: Date;
}

export interface GlucoseReading {
  id: string;
  value: number;
  timestamp: Date;
  userId: string;
}



export interface SavedMessage {
  id: string;
  messageId: string;
  chatId: string;
  content: string;
  timestamp: Date;
  userId: string;
  type: 'saved' | 'favorite';
  createdAt: Date;
}

class FirebaseService {
  private unsubscribers = new Map<string, Unsubscribe>();
  private pendingWrites = new Map<string, any>();
  private batchTimeout: NodeJS.Timeout | null = null;

  // Helper method to ensure user is authenticated
  private ensureAuthenticated() {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }
    return auth.currentUser.uid;
  }

  // Batch write operations for better performance
  private scheduleBatchWrite(docRef: string, data: any) {
    this.pendingWrites.set(docRef, data);
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    this.batchTimeout = setTimeout(() => {
      this.processBatchWrites();
    }, 100); // Batch writes within 100ms
  }

  private async processBatchWrites() {
    if (this.pendingWrites.size === 0) return;
    
    try {
      const batch = writeBatch(firestore);
      
      for (const [docPath, data] of this.pendingWrites) {
        const docRef = doc(firestore, docPath);
        batch.set(docRef, data, { merge: true });
      }
      
      await batch.commit();
      console.log(`Firebase: Batch committed ${this.pendingWrites.size} writes`);
      this.pendingWrites.clear();
    } catch (error) {
      console.error('Firebase: Batch write error:', error);
      // Retry individual writes if batch fails
      for (const [docPath, data] of this.pendingWrites) {
        try {
          const docRef = doc(firestore, docPath);
          await setDoc(docRef, data, { merge: true });
        } catch (individualError) {
          console.error(`Firebase: Individual write failed for ${docPath}:`, individualError);
        }
      }
      this.pendingWrites.clear();
    }
  }

  // Saved and Favorite Messages Management
  async saveMessage(messageId: string, chatId: string, content: string, timestamp: Date, type: 'saved' | 'favorite') {
    const userId = this.ensureAuthenticated();
    
    console.log(`Saving ${type} message for user:`, userId);
    
    const savedMessageData = {
      messageId,
      chatId,
      content,
      timestamp,
      userId,
      type,
      createdAt: new Date()
    };
    
    return withRetry(async () => {
      const docRef = await addDoc(collection(firestore, 'savedMessages'), savedMessageData);
      console.log(`${type} message saved successfully with ID:`, docRef.id);
      
      // Invalidate cache
      cacheManager.invalidate(cacheManager.getUserCacheKey(userId, `${type}Messages`));
      
      return docRef.id;
    });
  }

  async removeSavedMessage(savedMessageId: string) {
    return withRetry(async () => {
      const messageRef = doc(firestore, 'savedMessages', savedMessageId);
      await deleteDoc(messageRef);
      console.log('Saved message removed successfully:', savedMessageId);
      
      // Invalidate cache if user is authenticated
      if (auth.currentUser) {
        cacheManager.invalidate(cacheManager.getUserCacheKey(auth.currentUser.uid, 'savedMessages'));
        cacheManager.invalidate(cacheManager.getUserCacheKey(auth.currentUser.uid, 'favoriteMessages'));
      }
    });
  }

  subscribeToSavedMessages(type: 'saved' | 'favorite', callback: (messages: SavedMessage[]) => void): Unsubscribe {
    const userId = this.ensureAuthenticated();
    const cacheKey = cacheManager.getUserCacheKey(userId, `${type}Messages`);
    
    console.log(`Setting up real-time ${type} messages subscription for user:`, userId);
    
    // Check cache first
    const cachedMessages = cacheManager.get<SavedMessage[]>(cacheKey);
    if (cachedMessages) {
      console.log(`Firebase: Serving ${type} messages from cache`);
      callback(cachedMessages);
    }
    
    const q = query(
      collection(firestore, 'savedMessages'),
      where('userId', '==', userId),
      where('type', '==', type),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log(`${type} messages snapshot received, docs count:`, snapshot.docs.length);
        
        const messages = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate() || new Date(),
            createdAt: data.createdAt?.toDate() || new Date()
          };
        }) as SavedMessage[];
        
        // Update cache
        cacheManager.set(cacheKey, messages);
        
        console.log(`Processed ${type} messages:`, messages.length);
        callback(messages);
      },
      (error) => {
        console.error(`Error in ${type} messages subscription:`, error);
        // Try to serve from cache on error
        const cachedMessages = cacheManager.get<SavedMessage[]>(cacheKey);
        if (cachedMessages) {
          console.log(`Firebase: Serving stale ${type} messages from cache due to error`);
          callback(cachedMessages);
        } else {
          callback([]);
        }
      }
    );

    this.unsubscribers.set(`${type}Messages:${userId}`, unsubscribe);
    return unsubscribe;
  }

  // Enhanced reminders with real-time listeners
  async addReminder(reminder: Omit<Reminder, 'id' | 'userId' | 'createdAt'>) {
    const userId = this.ensureAuthenticated();
    
    console.log('Adding reminder for user:', userId);
    
    const reminderData = {
      ...reminder,
      userId,
      createdAt: new Date()
    };
    
    return withRetry(async () => {
      const docRef = await addDoc(collection(firestore, 'reminders'), reminderData);
      console.log('Reminder added successfully with ID:', docRef.id);
      
      // Invalidate cache
      cacheManager.invalidate(cacheManager.getUserCacheKey(userId, 'reminders'));
      
      return docRef.id;
    });
  }

  async updateReminder(id: string, updates: Partial<Reminder>) {
    return withRetry(async () => {
      const reminderRef = doc(firestore, 'reminders', id);
      await updateDoc(reminderRef, updates);
      console.log('Reminder updated successfully:', id);
      
      // Invalidate cache if user is authenticated
      if (auth.currentUser) {
        cacheManager.invalidate(cacheManager.getUserCacheKey(auth.currentUser.uid, 'reminders'));
      }
    });
  }

  async deleteReminder(id: string) {
    return withRetry(async () => {
      const reminderRef = doc(firestore, 'reminders', id);
      await deleteDoc(reminderRef);
      console.log('Reminder deleted successfully:', id);
      
      // Invalidate cache if user is authenticated
      if (auth.currentUser) {
        cacheManager.invalidate(cacheManager.getUserCacheKey(auth.currentUser.uid, 'reminders'));
      }
    });
  }

  subscribeToReminders(callback: (reminders: Reminder[]) => void): Unsubscribe {
    const userId = this.ensureAuthenticated();
    const cacheKey = cacheManager.getUserCacheKey(userId, 'reminders');
    
    console.log('Setting up real-time reminders subscription for user:', userId);
    
    // Check cache first
    const cachedReminders = cacheManager.get<Reminder[]>(cacheKey);
    if (cachedReminders) {
      console.log('Firebase: Serving reminders from cache');
      callback(cachedReminders);
    }
    
    const q = query(
      collection(firestore, 'reminders'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log('Reminders snapshot received, docs count:', snapshot.docs.length);
        
        const reminders = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date()
          };
        }) as Reminder[];
        
        // Update cache
        cacheManager.set(cacheKey, reminders);
        
        console.log('Processed reminders:', reminders.length);
        callback(reminders);
      },
      (error) => {
        console.error('Error in reminders subscription:', error);
        // Try to serve from cache on error
        const cachedReminders = cacheManager.get<Reminder[]>(cacheKey);
        if (cachedReminders) {
          console.log('Firebase: Serving stale reminders from cache due to error');
          callback(cachedReminders);
        } else {
          callback([]);
        }
      }
    );

    this.unsubscribers.set(`reminders:${userId}`, unsubscribe);
    return unsubscribe;
  }

  // Enhanced glucose readings with real-time listeners
  async addGlucoseReading(value: number) {
    const userId = this.ensureAuthenticated();
    
    console.log('Adding glucose reading for user:', userId, 'value:', value);
    
    const readingData = {
      value,
      timestamp: new Date(),
      userId
    };
    
    return withRetry(async () => {
      const docRef = await addDoc(collection(firestore, 'glucoseReadings'), readingData);
      console.log('Glucose reading added successfully with ID:', docRef.id);
      
      // Invalidate cache
      cacheManager.invalidate(cacheManager.getUserCacheKey(userId, 'glucoseReadings'));
      
      return docRef.id;
    });
  }

  subscribeToGlucoseReadings(callback: (readings: GlucoseReading[]) => void): Unsubscribe {
    const userId = this.ensureAuthenticated();
    const cacheKey = cacheManager.getUserCacheKey(userId, 'glucoseReadings');
    
    console.log('Setting up real-time glucose readings subscription for user:', userId);
    
    // Check cache first for immediate display
    const cachedReadings = cacheManager.get<GlucoseReading[]>(cacheKey);
    if (cachedReadings) {
      console.log('Firebase: Serving glucose readings from cache');
      callback(cachedReadings);
    }
    
    const q = query(
      collection(firestore, 'glucoseReadings'),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log('Glucose readings snapshot received, docs count:', snapshot.docs.length);
        
        const readings = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate() || new Date()
          };
        }) as GlucoseReading[];
        
        // Update cache immediately
        cacheManager.set(cacheKey, readings);
        
        console.log('Processed glucose readings:', readings.length);
        callback(readings);
      },
      (error) => {
        console.error('Error in glucose readings subscription:', error);
        // Try to serve from cache on error
        const cachedReadings = cacheManager.get<GlucoseReading[]>(cacheKey);
        if (cachedReadings) {
          console.log('Firebase: Serving stale glucose readings from cache due to error');
          callback(cachedReadings);
        } else {
          callback([]);
        }
      }
    );

    this.unsubscribers.set(`glucoseReadings:${userId}`, unsubscribe);
    return unsubscribe;
  }

  // Enhanced user profile with real-time updates and caching
  async getUserProfile(): Promise<UserProfile | null> {
    const userId = this.ensureAuthenticated();
    const cacheKey = cacheManager.getUserCacheKey(userId, 'profile');
    
    console.log('Fetching user profile for user:', userId);
    
    // Check cache first
    const cachedProfile = cacheManager.get<UserProfile>(cacheKey);
    if (cachedProfile) {
      console.log('Firebase: Serving profile from cache');
      return cachedProfile;
    }
    
    return withRetry(async () => {
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      
      if (userDoc.exists()) {
        const profileData = userDoc.data() as UserProfile;
        console.log('User profile loaded successfully:', profileData);
        
        // Cache the profile
        cacheManager.set(cacheKey, profileData);
        
        return profileData;
      } else {
        console.warn('User profile document does not exist');
        return null;
      }
    });
  }

  subscribeToUserProfile(callback: (profile: UserProfile | null) => void): Unsubscribe {
    const userId = this.ensureAuthenticated();
    const cacheKey = cacheManager.getUserCacheKey(userId, 'profile');
    
    console.log('Setting up real-time profile subscription for user:', userId);
    
    // Check cache first
    const cachedProfile = cacheManager.get<UserProfile>(cacheKey);
    if (cachedProfile) {
      console.log('Firebase: Serving profile from cache');
      callback(cachedProfile);
    }
    
    const unsubscribe = onSnapshot(
      doc(firestore, 'users', userId),
      (snapshot) => {
        if (snapshot.exists()) {
          const profileData = snapshot.data() as UserProfile;
          console.log('Profile snapshot received:', profileData);
          
          // Update cache
          cacheManager.set(cacheKey, profileData);
          
          callback(profileData);
        } else {
          console.warn('Profile document does not exist');
          callback(null);
        }
      },
      (error) => {
        console.error('Error in profile subscription:', error);
        // Try to serve from cache on error
        const cachedProfile = cacheManager.get<UserProfile>(cacheKey);
        if (cachedProfile) {
          console.log('Firebase: Serving stale profile from cache due to error');
          callback(cachedProfile);
        } else {
          callback(null);
        }
      }
    );

    this.unsubscribers.set(`profile:${userId}`, unsubscribe);
    return unsubscribe;
  }

  async updateUserProfile(updates: Partial<UserProfile>) {
    const userId = this.ensureAuthenticated();
    
    console.log('Updating user profile for user:', userId, 'updates:', updates);
    
    // Use batch writing for profile updates
    this.scheduleBatchWrite(`users/${userId}`, updates);
    
    // Optimistically update cache
    const cacheKey = cacheManager.getUserCacheKey(userId, 'profile');
    const cachedProfile = cacheManager.get<UserProfile>(cacheKey);
    if (cachedProfile) {
      cacheManager.set(cacheKey, { ...cachedProfile, ...updates });
    }
  }

  // Cleanup method to unsubscribe from all listeners
  cleanup(userId?: string) {
    if (userId) {
      // Cleanup specific user subscriptions
      const keysToRemove = Array.from(this.unsubscribers.keys())
        .filter(key => key.includes(userId));
      
      keysToRemove.forEach(key => {
        const unsubscribe = this.unsubscribers.get(key);
        if (unsubscribe) {
          unsubscribe();
          this.unsubscribers.delete(key);
        }
      });
    } else {
      // Cleanup all subscriptions
      this.unsubscribers.forEach(unsubscribe => unsubscribe());
      this.unsubscribers.clear();
    }
    
    // Process any pending batch writes
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.processBatchWrites();
    }
  }

  // BMI Calculation
  calculateBMI(weight: number, height: number): number {
    // Height should be in meters, weight in kg
    const heightInMeters = height / 100; // Convert cm to meters
    return weight / (heightInMeters * heightInMeters);
  }

  getBMICategory(bmi: number): string {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal';
    if (bmi < 30) return 'Overweight';
    return 'Obese';
  }
}

export const firebaseService = new FirebaseService();
