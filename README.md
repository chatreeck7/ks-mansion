# KS Mansion - Luxury Retreat Website

A beautifully crafted website for a luxury mansion reservation system. This project showcases an elegant, responsive web experience inspired by high-end hospitality websites like Aman hotels.

## 🏰 Overview

KS Mansion is a modern, responsive website built to represent a luxury estate and facilitate reservations. The site features elegant design, smooth animations, and a comprehensive user experience across multiple pages.

## 🎨 Features

- **Responsive Design**: Fully responsive layout that works seamlessly on desktop, tablet, and mobile devices
- **Multiple Pages**:
  - Home - Elegant landing page with hero section
  - Accommodations - Detailed room and suite information
  - Experiences - Curated activities and amenities
  - Dining - Restaurant and culinary offerings
  - Gallery - Visual showcase with filtering capabilities
  - Reservations - Comprehensive booking form
  - Contact - Contact information and inquiry form
- **Interactive Elements**:
  - Smooth scroll navigation
  - Mobile-friendly hamburger menu
  - Gallery filtering system
  - Form validation
  - Animated elements on scroll
- **Modern Aesthetics**:
  - Luxury color palette (gold accents, earthy tones)
  - Clean typography
  - Gradient backgrounds
  - Smooth transitions and hover effects

## 🛠️ Tech Stack

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with custom properties, flexbox, and grid
- **Vanilla JavaScript** - Interactive functionality
- **Vite** - Fast build tool and development server

## 📁 Project Structure

```
ks-mansion/
├── src/
│   ├── pages/              # HTML pages
│   │   ├── accommodations.html
│   │   ├── experiences.html
│   │   ├── dining.html
│   │   ├── gallery.html
│   │   ├── contact.html
│   │   └── reservations.html
│   ├── styles/             # CSS files
│   │   ├── main.css        # Global styles
│   │   ├── home.css        # Homepage specific
│   │   ├── pages.css       # Shared page styles
│   │   └── reservations.css # Reservation form styles
│   ├── scripts/            # JavaScript files
│   │   ├── main.js         # Core functionality
│   │   ├── reservations.js # Booking form handler
│   │   ├── gallery.js      # Gallery filtering
│   │   └── contact.js      # Contact form handler
│   ├── components/         # Reusable components (future)
│   └── assets/             # Static assets
│       ├── images/
│       ├── fonts/
│       └── icons/
├── public/                 # Public static files
├── config/                 # Configuration files
├── index.html             # Main entry point
├── package.json           # Dependencies and scripts
├── vite.config.js         # Vite configuration
└── README.md              # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ks-mansion
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

### Building for Production

To create a production build:
```bash
npm run build
```

The built files will be in the `dist/` directory.

To preview the production build:
```bash
npm run preview
```

## 🎯 Key Features Explained

### Navigation
- Fixed navigation bar with smooth scroll
- Mobile-responsive hamburger menu
- Active state indication
- Elegant "Reserve" call-to-action button

### Reservation System
- Date validation (prevents past dates, ensures checkout > checkin)
- Room type selection
- Guest count input
- Special requests textarea
- Add-on services (spa, dining, transfers, tours)
- Comprehensive booking policies sidebar

### Gallery
- Category filtering (All, Exterior, Rooms, Dining, Gardens)
- Smooth fade transitions
- Hover effects on images
- Responsive grid layout

### Forms
- Client-side validation
- Success/error message display
- Form reset after submission
- Console logging for debugging (replace with API calls)

## 🎨 Design System

### Color Palette
- **Primary**: `#2c2c2c` (Dark Gray)
- **Secondary**: `#8b7355` (Brown)
- **Accent**: `#d4af37` (Gold)
- **Text**: `#333` (Dark Gray)
- **Light Text**: `#666` (Medium Gray)
- **Background Light**: `#f8f8f8` (Off-white)

### Typography
- Font Family: Helvetica Neue, Arial, sans-serif
- Font Weight: 300 (Light), 500 (Medium)
- Letter Spacing: Used for elegant feel

### Spacing
- Container max-width: 1200px
- Section padding: 80px - 100px vertical
- Grid gaps: 30px - 60px

## 📱 Responsive Breakpoints

- Desktop: 968px and above
- Tablet: 768px - 967px
- Mobile: 767px and below

## 🔧 Customization

### Adding New Pages
1. Create HTML file in `src/pages/`
2. Add page entry to `vite.config.js`
3. Add navigation link in all HTML files
4. Create page-specific styles if needed

### Modifying Colors
Update CSS custom properties in `src/styles/main.css`:
```css
:root {
    --primary-color: #2c2c2c;
    --secondary-color: #8b7355;
    --accent-color: #d4af37;
    /* ... */
}
```

### Adding Images
1. Place images in `src/assets/images/`
2. Replace placeholder gradients with actual images:
```html
<div class="placeholder-img" style="background: url('/src/assets/images/your-image.jpg');">
```

## 🚧 Future Enhancements

- [ ] Backend API integration for reservations
- [ ] Image lightbox/modal for gallery
- [ ] Calendar widget for date selection
- [ ] Real-time availability checking
- [ ] Payment integration
- [ ] Email notifications
- [ ] Multi-language support
- [ ] Customer reviews section
- [ ] Blog/News section
- [ ] SEO optimization
- [ ] Analytics integration

## 📝 Notes

- Forms currently log to console - integrate with backend API
- Placeholder gradients should be replaced with actual images
- Update contact information with real details
- Configure map integration for location page

## 🤝 Contributing

When contributing to this project:
1. Follow the existing code style
2. Test on multiple browsers and devices
3. Ensure responsive design works correctly
4. Document any new features

## 📄 License

MIT License - feel free to use this project for your own purposes.

## 📧 Contact

For questions or support, please refer to the contact page or documentation.

---

Built with care for luxury hospitality experiences 🏰✨
