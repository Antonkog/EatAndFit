import { useEffect } from 'react';
import { APP_CONFIG } from '../config/appConfig';
export function FirebaseAnalytics(){useEffect(()=>{if(!APP_CONFIG.features.firebaseAnalytics)return;const config={apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,appId:import.meta.env.VITE_FIREBASE_APP_ID,measurementId:import.meta.env.VITE_FIREBASE_MEASUREMENT_ID};void Promise.all([import('@firebase/app'),import('@firebase/analytics')]).then(([appModule,analyticsModule])=>{const app=appModule.initializeApp(config);void analyticsModule.isSupported().then((supported)=>{if(supported)analyticsModule.getAnalytics(app)})}).catch(()=>undefined)},[]);return null}

