import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import ProfileHeader from '../components/profile/ProfileHeader'
import PostCard, { type TimelinePost } from '../components/posts/PostCard'
import ComposePost from '../components/posts/ComposePost'
import { Info, Image, Video, Users, MessageSquare } from 'lucide-react'

type TabType = 'WALL' | 'ABOUT' | 'PHOTOS' | 'VIDEOS' | 'FRIENDS'

export default function ProfileView() {
  const { userId } = useParams()
  const [activeTab, setActiveTab] = useState<TabType>('ABOUT')

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data } = await api.get(`/profiles/${userId}`)
      return data
    }
  })

  const { data: myProfile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: async () => {
      const { data } = await api.get('/profiles/me')
      return data as { id: string }
    },
  })

  const { data: wallData, isLoading: wallLoading } = useQuery({
    queryKey: ['profile-posts', userId],
    queryFn: async () => {
      const { data } = await api.get<{ data: TimelinePost[] }>(`/profiles/${userId}/posts`)
      return data
    },
    enabled: !!userId && activeTab === 'WALL',
  })

  const isOwnProfile = !!(myProfile && profile && myProfile.id === profile.id)

  if (isLoading) return <div className="p-20 text-center animate-pulse">Wczytywanie profilu...</div>
  if (!profile) return <div className="p-20 text-center">Profil nie istnieje</div>

  const tabs = [
    { id: 'WALL', label: 'Tablica', icon: MessageSquare },
    { id: 'ABOUT', label: 'O nas', icon: Info },
    { id: 'PHOTOS', label: 'Zdjęcia', icon: Image },
    { id: 'VIDEOS', label: 'Filmy', icon: Video },
    { id: 'FRIENDS', label: 'Znajomi', icon: Users },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <ProfileHeader profile={profile} />

      {/* Tab Switcher */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md px-2 py-3 border-b border-white/5 flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              data-testid={`profile-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-[0_8px_16px_rgba(var(--primary-rgb),0.25)]' 
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="px-4">
        <AnimatePresence mode="wait">
          {activeTab === 'ABOUT' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <section className="bg-zinc-900/40 p-6 rounded-3xl border border-white/5">
                    <h3 className="text-xl font-bold mb-4">Bio</h3>
                    <p className="text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {profile.bio || "Użytkownik nie dodał jeszcze opisu."}
                    </p>
                  </section>

                  <section className="bg-zinc-900/40 p-6 rounded-3xl border border-white/5">
                    <h3 className="text-xl font-bold mb-4">Zainteresowania</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests?.map((interest: string) => (
                        <span key={interest} className="px-4 py-2 bg-zinc-800 rounded-xl text-sm font-medium">
                          {interest}
                        </span>
                      )) || <p className="text-zinc-500 italic">Brak zainteresowań.</p>}
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                    <section className="bg-zinc-900/40 p-6 rounded-3xl border border-white/5">
                        <h3 className="text-xl font-bold mb-4">Detale</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <span className="text-zinc-500 font-medium">Dołączył</span>
                                <span className="font-bold">2 lata temu</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500 font-medium">Status</span>
                                <span className="text-green-500 font-bold flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    Online
                                </span>
                            </div>
                        </div>
                    </section>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'PHOTOS' && (
             <motion.div
               key="photos"
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="grid grid-cols-2 md:grid-cols-4 gap-4"
             >
               {profile.photos?.length > 0 ? profile.photos.map((photo: any) => (
                 <div key={photo.id} className="aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 group relative cursor-pointer">
                    <img src={photo.cdnUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                 </div>
               )) : (
                 <div className="col-span-full py-20 text-center text-zinc-500">Brak zdjęć do wyświetlenia.</div>
               )}
             </motion.div>
          )}

          {activeTab === 'WALL' && (
             <motion.div
               key="wall"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="space-y-6"
             >
               {isOwnProfile && <ComposePost />}
               {wallLoading && <p className="text-zinc-500 text-center py-8">Ładowanie tablicy…</p>}
               {!wallLoading && wallData?.data?.length === 0 && (
                 <div className="text-center py-12">
                   <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-700">
                     <MessageSquare size={32} />
                   </div>
                   <h3 className="text-zinc-500 font-bold">Brak postów na tablicy</h3>
                 </div>
               )}
               <div className="space-y-4">
                 {wallData?.data?.map((post) => (
                   <PostCard key={post.id} post={post} />
                 ))}
               </div>
             </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
