import { Tabs } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { colors, fonts } from '../../src/theme'

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accentBright, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border }, tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 } }}>
    <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ focused, size }) => <Ionicons name="compass-outline" color={focused ? colors.accentBright : colors.muted} size={size} /> }} />
    <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ focused, size }) => <Ionicons name="heart-outline" color={focused ? colors.accentBright : colors.muted} size={size} /> }} />
    <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ focused, size }) => <Ionicons name="calendar-outline" color={focused ? colors.accentBright : colors.muted} size={size} /> }} />
    <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ focused, size }) => <Ionicons name="chatbubbles-outline" color={focused ? colors.accentBright : colors.muted} size={size} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Account', tabBarIcon: ({ focused, size }) => <Ionicons name="person-outline" color={focused ? colors.accentBright : colors.muted} size={size} /> }} />
  </Tabs>
}
