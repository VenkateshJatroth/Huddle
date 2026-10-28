export type CommunityPost = {
  id: string;
  author: string;
  username: string;
  tone: number;
  time: string;
  location: string;
  language: string;
  text: string;
  likes: number;
  replies: number;
};

export type SuggestedAccount = {
  id: string;
  name: string;
  username: string;
  tone: number;
  location: string;
  language: string;
  interests: string[];
  description: string;
};

export const samplePosts: CommunityPost[] = [
  {
    id: "post-jaipur-books",
    author: "Mira Shah",
    username: "mirareads",
    tone: 0,
    time: "24 min ago",
    location: "Jaipur",
    language: "English",
    text: "Anyone heading to the literature festival this weekend? A few of us are planning to explore the old city after the talks. You’re welcome to join 📚",
    likes: 28,
    replies: 6,
  },
  {
    id: "post-bengaluru-cycling",
    author: "Arjun Rao",
    username: "arjunonwheels",
    tone: 1,
    time: "1 hr ago",
    location: "Bengaluru",
    language: "Kannada · English",
    text: "Our Sunday morning cycling group starts at Cubbon Park at 7. We ride easy, stop for chai, and beginners are always welcome 🚲",
    likes: 42,
    replies: 9,
  },
  {
    id: "post-kochi-food",
    author: "Nisha Thomas",
    username: "nishacooks",
    tone: 2,
    time: "3 hrs ago",
    location: "Kochi",
    language: "Malayalam · English",
    text: "Trying to find a few people who love swapping family recipes. I can bring my grandmother’s ada pradhaman recipe to the next meetup ✨",
    likes: 35,
    replies: 12,
  },
];

export const suggestedAccounts: SuggestedAccount[] = [
  {
    id: "account-sana",
    name: "Sana Iqbal",
    username: "sana.in.pune",
    tone: 3,
    location: "Pune, Maharashtra",
    language: "Hindi · English · Urdu",
    interests: ["Photography", "Food"],
    description: "Finding the best chai spots and taking photos along the way.",
  },
  {
    id: "account-dev",
    name: "Dev Menon",
    username: "devbuilds",
    tone: 4,
    location: "Kochi, Kerala",
    language: "Malayalam · English",
    interests: ["Technology", "Cycling"],
    description: "Weekend rides, open source, and long conversations by the sea.",
  },
  {
    id: "account-priya",
    name: "Priya Kulkarni",
    username: "priyareads",
    tone: 0,
    location: "Mumbai, Maharashtra",
    language: "Marathi · English",
    interests: ["Books", "Arts"],
    description: "Hosting a tiny book club that keeps getting a little bigger.",
  },
  {
    id: "account-karthik",
    name: "Karthik Reddy",
    username: "karthik.cooks",
    tone: 1,
    location: "Hyderabad, Telangana",
    language: "Telugu · English",
    interests: ["Food", "Travel"],
    description: "Learning regional recipes from every place I visit.",
  },
];

export const followRequests = [
  { id: "request-ananya", name: "Ananya Bose", username: "ananyabose", tone: 2, detail: "2 shared interests · Kolkata" },
  { id: "request-rahul", name: "Rahul Desai", username: "rahuloutside", tone: 4, detail: "Photography · Ahmedabad" },
];

export const profilePosts: CommunityPost[] = [
  {
    id: "profile-post-walk",
    author: "Aarav Patel",
    username: "aarav.patel",
    tone: 1,
    time: "Yesterday",
    location: "Ahmedabad",
    language: "Gujarati · English",
    text: "A quiet Sunday walk through the old pols is my favorite way to see the city again. Any hidden lanes I should explore next?",
    likes: 31,
    replies: 4,
  },
  {
    id: "profile-post-music",
    author: "Aarav Patel",
    username: "aarav.patel",
    tone: 1,
    time: "4 days ago",
    location: "Ahmedabad",
    language: "Gujarati · English",
    text: "Putting together a playlist of live folk music from across Gujarat. Share an artist I should add 🎶",
    likes: 19,
    replies: 7,
  },
];

export const interestOptions = ["Books", "Food", "Music", "Travel", "Photography", "Cycling", "Technology", "Arts", "Wellness"];
export const languageOptions = ["Any language", "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi"];
export const regionOptions = ["Any region", "North", "South", "West", "East"];
