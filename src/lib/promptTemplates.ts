/** Prompt templates organized by category */

export interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  templates: PromptTemplate[];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "portrait",
    name: "Portrait",
    icon: "👤",
    templates: [
      { id: "p1", title: "Studio Headshot", prompt: "Professional studio headshot, soft key lighting, neutral background, sharp focus on eyes, shallow depth of field" },
      { id: "p2", title: "Environmental Portrait", prompt: "Environmental portrait in a cozy bookshop, warm ambient lighting, natural pose, candid expression, bokeh background" },
      { id: "p3", title: "Fantasy Character", prompt: "Fantasy character portrait, intricate armor details, glowing magical eyes, dramatic rim lighting, detailed face" },
      { id: "p4", title: "Vintage Portrait", prompt: "Vintage film portrait, grain texture, warm color grading, soft focus, golden hour lighting, retro aesthetic" },
      { id: "p5", title: "Cyberpunk Character", prompt: "Cyberpunk character portrait, neon-lit face, holographic UI elements, rain-soaked, chrome implants, futuristic city reflection in eyes" },
    ],
  },
  {
    id: "landscape",
    name: "Landscape",
    icon: "🏔️",
    templates: [
      { id: "l1", title: "Mountain Vista", prompt: "Epic mountain landscape at sunrise, golden light on snow peaks, misty valleys, alpine meadow foreground, dramatic clouds" },
      { id: "l2", title: "Ocean Sunset", prompt: "Dramatic ocean sunset, golden and purple sky, waves crashing on rocky shore, long exposure water effect, vibrant colors" },
      { id: "l3", title: "Enchanted Forest", prompt: "Enchanted forest path, dappled sunlight through canopy, moss-covered trees, fireflies, mystical atmosphere, fog" },
      { id: "l4", title: "Desert Dunes", prompt: "Vast desert sand dunes at golden hour, ripple patterns in sand, long shadows, clear sky gradient, minimalist composition" },
      { id: "l5", title: "Northern Lights", prompt: "Northern lights over a frozen lake, vibrant green and purple aurora, star-filled sky, snow-covered pine trees, reflection in ice" },
    ],
  },
  {
    id: "concept",
    name: "Concept Art",
    icon: "⚔️",
    templates: [
      { id: "c1", title: "Fantasy Castle", prompt: "Fantasy castle on a cliff overlooking the sea, dramatic storm clouds, waterfalls, flying dragons in distance, epic scale, matte painting style" },
      { id: "c2", title: "Sci-Fi Cityscape", prompt: "Futuristic cityscape, towering skyscrapers with holographic billboards, flying vehicles, neon-lit streets, cyberpunk atmosphere" },
      { id: "c3", title: "Underwater Ruins", prompt: "Ancient underwater ruins, bioluminescent coral growing on pillars, shafts of light from surface, fish schools, mysterious atmosphere" },
      { id: "c4", title: "Steampunk Workshop", prompt: "Steampunk inventor's workshop, brass gears and pipes, steam vents, glowing inventions, cluttered but organized, warm gas lamp lighting" },
      { id: "c5", title: "Alien Landscape", prompt: "Alien planet landscape, bioluminescent flora, twin moons in sky, crystal formations, exotic atmosphere, otherworldly color palette" },
    ],
  },
  {
    id: "product",
    name: "Product",
    icon: "📦",
    templates: [
      { id: "pr1", title: "Minimal Product Shot", prompt: "Clean product photography, white background, soft studio lighting, sharp details, professional commercial style, centered composition" },
      { id: "pr2", title: "Lifestyle Product", prompt: "Lifestyle product photography, natural setting, warm tones, casual arrangement, soft natural light, aspirational mood" },
      { id: "pr3", title: "Tech Gadget", prompt: "Sleek technology product render, dark background, dramatic colored accent lighting, reflective surface, floating in space, premium feel" },
      { id: "pr4", title: "Food Photography", prompt: "Appetizing food photography, rustic wooden table, fresh ingredients scattered around, steam rising, natural side lighting, shallow depth of field" },
    ],
  },
  {
    id: "character",
    name: "Character Design",
    icon: "🧙",
    templates: [
      { id: "ch1", title: "Warrior", prompt: "Full body character design, battle-worn warrior, detailed armor with scratches, confident pose, weapon at side, dynamic lighting" },
      { id: "ch2", title: "Sci-Fi Pilot", prompt: "Character design sheet, futuristic space pilot, flight suit with patches, helmet under arm, determined expression, hangar bay background" },
      { id: "ch3", title: "Forest Druid", prompt: "Forest druid character, flowing robes with leaf patterns, wooden staff with glowing crystal, antler crown, surrounded by small woodland creatures" },
      { id: "ch4", title: "Robot Companion", prompt: "Friendly robot character design, rounded shapes, expressive LED eyes, polished metal body, small and cute proportions, floating antenna" },
      { id: "ch5", title: "Noir Detective", prompt: "Film noir detective character, long trench coat, fedora casting shadow over eyes, cigarette smoke, rain-soaked alley, moody black and white with amber accents" },
    ],
  },
  {
    id: "abstract",
    name: "Abstract & Art",
    icon: "🎨",
    templates: [
      { id: "a1", title: "Fluid Colors", prompt: "Abstract fluid art, vibrant flowing colors, marble ink patterns, dynamic movement, rich purples and golds, high contrast" },
      { id: "a2", title: "Geometric Patterns", prompt: "Geometric abstract art, interlocking shapes, bold color palette, clean lines, satisfying symmetry, modern design" },
      { id: "a3", title: "Surreal Dream", prompt: "Surrealist dreamscape, melting clocks on impossible architecture, floating objects, impossible perspective, vivid colors, Dali-inspired" },
      { id: "a4", title: "Fractal Nature", prompt: "Fractal art inspired by nature, recursive spirals, Fibonacci patterns, organic shapes, iridescent colors, mathematical beauty" },
    ],
  },
  {
    id: "architecture",
    name: "Architecture",
    icon: "🏛️",
    templates: [
      { id: "ar1", title: "Modern House", prompt: "Modern minimalist architecture, floor-to-ceiling glass walls, infinity pool, mountain backdrop, golden hour lighting, luxury design" },
      { id: "ar2", title: "Gothic Cathedral", prompt: "Gothic cathedral interior, soaring vaulted ceilings, stained glass windows casting colored light, stone pillars, reverent atmosphere" },
      { id: "ar3", title: "Futuristic Station", prompt: "Futuristic space station interior, curved white corridors, holographic displays, plants in hydroponic walls, astronauts walking, clean design" },
    ],
  },
];
