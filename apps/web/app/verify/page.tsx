"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/AuthContext';

export default function Verify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [message, setMessage] = useState('Verifying your magic link...');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setMessage('Invalid magic link. No token provided.');
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_SERVER}/api/v1/auth/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        if (response.ok) {
          const data = await response.json();
          login(data.token); // Assuming the response includes a token
          setMessage('Login successful! Redirecting...');
          setTimeout(() => {
            router.push('/webtrading');
          }, 2000);
        } else {
          setMessage('Invalid or expired magic link.');
        }
      } catch (error) {
        console.error('Error verifying token:', error);
        setMessage('An error occurred during verification.');
      }
    };

    verifyToken();
  }, [searchParams, login, router]);

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md text-center border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Verifying Magic Link</h1>
        <p className="text-gray-600">{message}</p>
        {message.includes('Redirecting') && (
          <div className="mt-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        )}
      </div>
    </div>
  );
}
