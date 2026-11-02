import { Redirect } from 'expo-router';
/** Preserve saved report URLs in the consolidated results area. */
export default function ReportsScreen() { return <Redirect href="/pci-results?tab=history" />; }
