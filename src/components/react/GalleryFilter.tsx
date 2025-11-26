import { useState } from 'react';

interface GalleryItem {
  id: number;
  category: string;
  title: string;
  description: string;
  gradient: string;
}

const galleryItems: GalleryItem[] = [
  { id: 1, category: 'exterior', title: 'Grand Entrance', description: 'The historic facade welcomes guests', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 2, category: 'exterior', title: 'Estate Overview', description: 'Panoramic view of the mansion', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 3, category: 'rooms', title: 'Presidential Suite', description: 'Luxury accommodation interior', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 4, category: 'rooms', title: 'Master Suite', description: 'Elegant bedroom design', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 5, category: 'rooms', title: 'Spa Bathroom', description: 'Marble and luxury amenities', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 6, category: 'dining', title: 'Grand Dining Room', description: 'Fine dining atmosphere', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { id: 7, category: 'dining', title: 'Wine Cellar', description: 'Private dining venue', gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
  { id: 8, category: 'gardens', title: 'Garden Walkways', description: 'Landscaped garden paths', gradient: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' },
  { id: 9, category: 'gardens', title: 'Central Fountain', description: 'Historic water feature', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
  { id: 10, category: 'gardens', title: 'Garden Terrace', description: 'Outdoor dining area', gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)' },
  { id: 11, category: 'exterior', title: 'Evening Ambiance', description: 'Illuminated facade at dusk', gradient: 'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 100%)' },
  { id: 12, category: 'rooms', title: 'Suite Living Room', description: 'Comfortable sitting area', gradient: 'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)' },
];

export default function GalleryFilter() {
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'exterior', label: 'Exterior' },
    { value: 'rooms', label: 'Rooms' },
    { value: 'dining', label: 'Dining' },
    { value: 'gardens', label: 'Gardens' },
  ];

  const filteredItems = activeCategory === 'all'
    ? galleryItems
    : galleryItems.filter(item => item.category === activeCategory);

  return (
    <div>
      {/* Categories */}
      <div className="flex justify-center gap-4 flex-wrap my-10">
        {categories.map((category) => (
          <button
            key={category.value}
            onClick={() => setActiveCategory(category.value)}
            className={`px-6 py-2 border transition-all text-sm tracking-widest uppercase ${
              activeCategory === category.value
                ? 'bg-accent border-accent text-primary'
                : 'bg-transparent border-primary text-primary hover:bg-accent hover:border-accent hover:text-primary'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-10">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="rounded overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl"
          >
            <div className="w-full h-[300px] overflow-hidden">
              <div
                className="placeholder-img"
                style={{ background: item.gradient }}
              >
                <span>{item.title}</span>
              </div>
            </div>
            <div className="p-5 bg-white">
              <h4 className="text-primary mb-1 text-lg">{item.title}</h4>
              <p className="text-sm text-text-light">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
