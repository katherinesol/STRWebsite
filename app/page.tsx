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

  // cover photo per property for the homepage cards
  const { data: coverRows } = await supabase
    .from('property_photos')
    .select('property_id, storage_path, is_cover, sort_order')
    .eq('media_type', 'image')
    .order('sort_order')
  const covers: Record<string, string> = {}
  for (const row of coverRows || []) {
    // first photo per property, overridden by explicit cover
    if (!covers[row.property_id] || row.is_cover) {
      const { data } = supabase.storage.from('property-photos').getPublicUrl(row.storage_path)
      covers[row.property_id] = data.publicUrl
    }
  }

  return (
    <>
      <Nav />
      <Hero />
      <Properties covers={covers} />
      <WhyDirect />
      <ReviewStrip reviews={reviews || []} />
      <HowItWorks />
      <Newsletter />
      <Footer />
    </>
  )
}
