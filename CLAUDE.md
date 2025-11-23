# CLAUDE.md - AI Assistant Context Document

This document provides context for AI assistants (like Claude) working on the KS Mansion project. It contains architectural decisions, patterns, and guidelines to maintain consistency.

## 📋 Project Overview

**Project Name**: KS Mansion Website
**Type**: Static luxury hotel/mansion website with reservation system
**Tech Stack**: HTML5, CSS3, Vanilla JavaScript, Vite
**Design Inspiration**: Aman Hotels and luxury hospitality websites
**Status**: Initial development phase

## 🏗️ Architecture Decisions

### Why Vanilla JavaScript?
- **Simplicity**: No framework overhead for a content-focused site
- **Performance**: Faster load times, smaller bundle size
- **Learning**: Easier for developers of all levels to understand and maintain
- **Control**: Direct DOM manipulation for specific interactions

### Why Vite?
- **Fast Development**: Lightning-fast HMR (Hot Module Replacement)
- **Modern**: ES modules support out of the box
- **Simple Configuration**: Minimal setup required
- **Build Optimization**: Excellent production builds

### Directory Structure Philosophy
```
src/
├── pages/       # Each major page gets its own HTML file
├── styles/      # Modular CSS (main.css for globals, page-specific files)
├── scripts/     # JavaScript modules by functionality
├── components/  # Future: Reusable HTML/JS components
└── assets/      # Static files (images, fonts, icons)
```

**Rationale**:
- Separation of concerns
- Easy to locate and modify specific features
- Scalable for future growth
- Clear boundaries between different aspects

## 🎨 Design System

### Color Philosophy
The color scheme evokes luxury, elegance, and timelessness:
- **Gold (#d4af37)**: Luxury, premium quality
- **Dark tones**: Sophistication, elegance
- **Earthy browns**: Natural, grounded, welcoming
- **Light backgrounds**: Clean, spacious, breathable

### Typography Choices
- **Helvetica Neue/Arial**: Clean, modern, highly readable
- **Light weights (300)**: Elegant, not overpowering
- **Letter spacing**: Creates breathing room, adds sophistication
- **Responsive sizes**: Scales down gracefully on mobile

### Layout Patterns
1. **Hero Sections**: Full viewport height, centered content, overlay
2. **Content Sections**: Max-width containers, generous padding
3. **Grid Layouts**: Responsive, auto-fit patterns
4. **Card Components**: Subtle shadows, hover effects

## 🔧 Code Patterns & Conventions

### HTML Structure
```html
<!-- Standard page structure -->
<nav class="navbar">...</nav>
<section class="page-header">...</section>
<section class="page-content">
    <div class="container">
        <!-- Content here -->
    </div>
</section>
<footer class="footer">...</footer>
```

### CSS Naming
- **BEM-inspired** but not strict
- **Descriptive names**: `.accommodation-card`, `.hero-content`
- **Modifiers**: `.btn-primary`, `.btn-secondary`
- **State classes**: `.active`, `.hidden`, `.show`

### JavaScript Patterns
```javascript
// Module pattern with DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const element = document.getElementById('...');

    // Add event listeners
    element.addEventListener('event', handler);

    // Helper functions
    function handler() { ... }
});
```

**Key Principles**:
- Wait for DOM to load
- Cache DOM queries
- Use event delegation where appropriate
- Separate concerns (one file per feature)

## 📄 Page-by-Page Guide

### index.html (Homepage)
- **Purpose**: First impression, overview of mansion
- **Key Sections**: Hero, Introduction, Features Grid, CTA
- **Styling**: `home.css` + `main.css`
- **Script**: `main.js` only

### accommodations.html
- **Purpose**: Showcase rooms and suites
- **Pattern**: Alternating image-text layout
- **Data Structure**: Cards with image, info, amenities list
- **Note**: Images are placeholders (gradients) - replace with real photos

### experiences.html
- **Purpose**: Activities, wellness, tours
- **Pattern**: Grid of experience cards
- **Structure**: Image + content (title, description, features list)

### dining.html
- **Purpose**: Restaurants and culinary offerings
- **Pattern**: Alternating sections (left/right image placement)
- **Unique Feature**: Special offerings grid at bottom

### gallery.html
- **Purpose**: Visual showcase of property
- **Interactive Feature**: Category filtering
- **Script**: `gallery.js` for filter logic
- **Future Enhancement**: Add lightbox modal for full-size images

### reservations.html
- **Purpose**: Booking form
- **Complex Layout**: Form (left) + Info sidebar (right)
- **Validation**: Date validation, required fields
- **Script**: `reservations.js` for form handling
- **Note**: Currently logs to console - needs backend integration

### contact.html
- **Purpose**: Contact information and inquiry form
- **Sections**: Contact form, info cards, map, directions
- **Script**: `contact.js` for form handling

## 🎯 Feature Implementation Patterns

### Adding a Form
1. Create form HTML with semantic markup
2. Use `.form-group`, `.form-row` classes
3. Add required attributes and labels
4. Create dedicated JS file for handling
5. Implement validation and success/error messages
6. Log data to console (temporary) or send to API

### Adding a New Page
1. Create HTML in `src/pages/`
2. Copy navigation and footer from existing page
3. Update `vite.config.js` rollupOptions.input
4. Create page-specific CSS if needed
5. Add navigation link to all pages
6. Test responsive design

### Styling a New Component
1. Use existing color variables from `:root`
2. Follow mobile-first approach
3. Add hover states for interactive elements
4. Ensure keyboard accessibility
5. Test at all breakpoints

## 🐛 Common Issues & Solutions

### Issue: Navigation overlaps content
**Solution**: All pages have `margin-top: 70px` on first section to account for fixed navbar

### Issue: Date picker shows past dates
**Solution**: Set `min` attribute dynamically in JavaScript:
```javascript
const today = new Date().toISOString().split('T')[0];
dateInput.min = today;
```

### Issue: Mobile menu doesn't close after clicking link
**Solution**: Add click handlers to nav links:
```javascript
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});
```

## 🚀 Future Development Roadmap

### Phase 1: Content & Assets (Current)
- [ ] Replace placeholder images with real photos
- [ ] Add actual mansion content and descriptions
- [ ] Update contact information

### Phase 2: Backend Integration
- [ ] Set up backend API for reservations
- [ ] Implement form submission endpoints
- [ ] Add email notification system
- [ ] Create admin dashboard for managing bookings

### Phase 3: Enhanced Features
- [ ] Real-time availability calendar
- [ ] Payment processing integration
- [ ] Customer accounts and login
- [ ] Booking history and management

### Phase 4: Optimization & SEO
- [ ] Image optimization and lazy loading
- [ ] SEO meta tags and structured data
- [ ] Performance optimization
- [ ] Analytics integration

### Phase 5: Advanced Features
- [ ] Multi-language support (i18n)
- [ ] Customer reviews and ratings
- [ ] Blog/News section
- [ ] Virtual tours (360° images/video)

## 💡 AI Assistant Guidelines

When working on this project:

### DO:
✅ Maintain the existing design system and color palette
✅ Follow the established file structure
✅ Use semantic HTML5 elements
✅ Write vanilla JavaScript (no frameworks)
✅ Ensure responsive design for all changes
✅ Test form validation logic
✅ Keep accessibility in mind (ARIA labels, keyboard nav)
✅ Document any new patterns or components
✅ Use CSS custom properties for consistent theming

### DON'T:
❌ Add frameworks (React, Vue, etc.) without discussion
❌ Break the existing URL structure
❌ Use inline styles (except for dynamic JS changes)
❌ Add dependencies without justification
❌ Remove placeholder gradients without replacement images
❌ Change the color scheme without updating `:root` variables
❌ Create overly complex solutions for simple problems

### When Adding Features:
1. **Read existing code** first to understand patterns
2. **Follow established patterns** for consistency
3. **Test responsiveness** at all breakpoints
4. **Consider accessibility** (screen readers, keyboard)
5. **Document your changes** in this file if they introduce new patterns
6. **Keep it simple** - luxury doesn't mean complexity

### When Debugging:
1. Check browser console for errors
2. Verify all file paths are correct (especially after moving files)
3. Test on multiple browsers (Chrome, Firefox, Safari)
4. Validate HTML and CSS
5. Check responsive design with DevTools

## 📚 Resources & References

### Design Inspiration
- Aman Hotels: https://www.aman.com
- Four Seasons: https://www.fourseasons.com
- Luxury hotel design best practices

### Technical Documentation
- Vite: https://vitejs.dev/
- MDN Web Docs: https://developer.mozilla.org/
- CSS Grid: https://css-tricks.com/snippets/css/complete-guide-grid/
- Flexbox: https://css-tricks.com/snippets/css/a-guide-to-flexbox/

### Color Theory
- Gold accents for luxury: Traditional association with wealth and quality
- Earthy tones: Create warmth and comfort
- High contrast: Ensures readability and accessibility

## 🔐 Security Considerations

### Current (Static Site)
- No sensitive data storage
- Client-side validation only (not security, just UX)
- No authentication system

### Future (With Backend)
- [ ] Implement server-side validation
- [ ] Use HTTPS for all traffic
- [ ] Sanitize all user inputs
- [ ] Implement CSRF protection
- [ ] Secure payment gateway integration
- [ ] Rate limiting on forms
- [ ] Environment variables for API keys

## 🧪 Testing Checklist

When making changes, verify:
- [ ] Desktop layout (1920px, 1440px, 1024px)
- [ ] Tablet layout (768px)
- [ ] Mobile layout (375px, 414px)
- [ ] Navigation works on all devices
- [ ] Forms validate correctly
- [ ] All links work
- [ ] Images load properly
- [ ] No console errors
- [ ] Smooth animations
- [ ] Accessibility (keyboard navigation, screen reader friendly)

## 📞 Support & Maintenance

### Code Organization
- Each feature is self-contained and modular
- CSS is organized by scope (global → page-specific)
- JavaScript files are small and focused on single features

### Making Updates
- **Content changes**: Update HTML directly
- **Style changes**: Use CSS custom properties when possible
- **New features**: Follow existing patterns
- **Bug fixes**: Check both desktop and mobile

### Performance Notes
- Current site is very lightweight (~100KB total)
- Vite optimizes production builds automatically
- Consider lazy loading images when real photos are added

---

**Last Updated**: Initial setup
**Maintained By**: Development Team
**Version**: 1.0.0

This document should be updated as the project evolves and new patterns emerge.
