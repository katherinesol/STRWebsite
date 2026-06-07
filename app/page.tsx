import { createAdminClient } from '@/lib/supabase/server'
import Nav from '@/components/ui/Nav'
import Hero from '@/components/property/Hero'
import Properties from '@/components/property/Properties'
import WhyDirect from '@/components/ui/WhyDirect'
import ReviewStrip from '@/components/ui/ReviewStrip'
import HowItWorks from '@/components/ui/HowItWorks'
import Newsletter from '@/components/ui/Newsletter'
import Footer from '@/components/ui/Footer'

export const revalidate = 3600 // revalidate every hour

export default async function Home() {
  const supabase = createAdminClient()
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, guest_name, body, platform, property_id, created_at')
    .eq('published', true)
    .gte('rating', 5)
    .order('created_at', { ascending: false })

  return (
    <>
      <Nav />
      <Hero />
      <Properties />
      <WhyDirect />
      <ReviewStrip reviews={reviews || []} />
      <HowItWorks />
      <Newsletter />
      <Footer />
    </>
  )
}
