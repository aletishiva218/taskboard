import { redirect } from 'next/navigation';

// Root redirects — auth check happens in middleware
export default function RootPage() {
  redirect('/dashboard');
}
