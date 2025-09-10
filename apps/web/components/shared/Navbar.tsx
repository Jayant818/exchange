"use client";

import React from 'react'
import Link from 'next/link'
import { TrendingUp, User, LogOut } from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'

const Navbar = () => {
  const { user, isAuthenticated, logout, balance } = useAuth();
  console.log({user, isAuthenticated, balance});
  return (
    <div className='w-full flex justify-between items-center p-6 border-b border-gray-200 bg-white h-[7%] shadow-sm'>
      <Link href="/" className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <TrendingUp className="text-white" size={24} />
        </div>
        <div>
          <div className="text-blue-600 text-2xl font-bold">exness</div>
          <div className="text-gray-500 text-xs">Trading Simulator</div>
        </div>
      </Link>
      
      <div className="flex items-center space-x-4">
        {isAuthenticated ? (
          <>
            <div className="flex items-center space-x-3 text-gray-700">
              <User size={18} />
              <span className="font-medium">{user?.username}</span>
              {balance && (
                <span className="text-green-600 font-mono">
                  ${(Number(balance)/100).toFixed(2)}
                </span>
              )}
            </div>
            <button 
              onClick={logout}
              className='flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300'
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </>
        ) : (
          <>
            <Link 
              href="/login"
              className='bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300 font-medium'
            >
              Sign In
            </Link>
            <Link 
              href="/login"
              className='bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium'
            >
              Get Started
            </Link>
          </>
        )}
        
        {/* <Link 
          href="/webtrading"
          className='bg-[#ff6b00] text-white px-6 py-2 rounded-lg hover:bg-[#e55a00] transition-colors font-medium'
        >
          Start Trading
        </Link> */}
      </div>
    </div>
  )
}

export default Navbar