import "dotenv/config";
export default {  expo: {    name: "Actu Parlement",    slug: "actu-parlement",    extra: {      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,    },  },}; 
