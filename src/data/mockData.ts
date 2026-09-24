export type Topic = 'DSA' | 'Java' | 'Spring Boot' | 'System Design' | 'Networking' | 'Operating System' | 'Database' | 'JavaScript' | 'React' | 'AI Engineering' | 'DevOps'
export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type Confidence = 'New' | 'Learning' | 'Familiar' | 'Mastered'

export interface Question {
  id: string
  topic: Topic
  difficulty: Difficulty
  question: string
  answer: string
  explanation: string
  interviewNotes: string
  followUps: string[]
  tags: string[]
  confidenceScore: number // 0-100 derived per-user via recall_reviews
  reviewCount: number // derived
  bookmarked: boolean // derived per-user
}

// Color fallback for topics when API does not return color (contract §3.6 returns color, but fallback kept client-side)
export const TOPIC_COLORS: Record<Topic, string> = {
  'DSA': '#3B82F6',
  'Java': '#F59E0B',
  'Spring Boot': '#22C55E',
  'System Design': '#8B5CF6',
  'Networking': '#06B6D4',
  'Operating System': '#EC4899',
  'Database': '#10B981',
  'JavaScript': '#EAB308',
  'React': '#61DAFB',
  'AI Engineering': '#F97316',
  'DevOps': '#EF4444',
}

export type TopicBundle = { slug: string; name: string; description: string; topics: Topic[]; color: string; icon?: string }
export const TOPIC_BUNDLES: TopicBundle[] = [
  { slug: 'software-engineering', name: 'Software Engineering', description: 'Core CS + System Design', topics: ['DSA', 'System Design', 'Operating System', 'Networking', 'Database'], color: '#0EA5E9' },
  { slug: 'ai-engineer', name: 'AI Engineer', description: 'DSA • AI • DB • Java', topics: ['AI Engineering', 'DSA', 'Database', 'Java'], color: '#F97316' },
  { slug: 'backend-engineer', name: 'Backend Engineer', description: 'Java • Spring • System • DB', topics: ['Java', 'Spring Boot', 'System Design', 'Database', 'Networking'], color: '#22C55E' },
  { slug: 'frontend-engineer', name: 'Frontend Engineer', description: 'JS • React • System', topics: ['JavaScript', 'React', 'System Design'], color: '#61DAFB' },
  { slug: 'fullstack', name: 'Full Stack', description: 'DSA + Full Stack Mix', topics: ['DSA', 'Java', 'Spring Boot', 'JavaScript', 'React', 'System Design', 'Database'], color: '#8B5CF6' },
]
