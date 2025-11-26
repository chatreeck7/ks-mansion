# CLAUDE.md - AI Assistant Context Document

This document provides comprehensive context for AI assistants (like Claude) working on the KS Mansion project. It contains architectural decisions, design patterns, development guidelines, and best practices to maintain consistency and quality.

**Last Updated**: November 23, 2025
**Version**: 2.0.0
**Tech Stack**: Astro 5.0 + React 19 + TypeScript 5.9 + Tailwind CSS 3

---

## 📋 Project Overview

**Project Name**: KS Mansion Website
**Type**: Static-first luxury hotel website with interactive islands
**Tech Stack**: Astro 5.0, React 19, TypeScript 5.9, Tailwind CSS 3, Framer Motion 12
**Design Inspiration**: Aman Hotels and luxury hospitality websites
**Status**: Production-ready modern stack (v2.0)

### Core Philosophy
- **Performance First**: Ship minimal JavaScript, prioritize static HTML
- **Progressive Enhancement**: Start with working HTML, enhance with JavaScript
- **Type Safety**: TypeScript everywhere for reliability
- **Utility-First Styling**: Tailwind CSS for consistency and speed
- **Component-Based**: Modular, reusable components

---

## 🏗️ Architecture Decisions

### Why Astro 5.0?
**Decision**: Chosen as the meta-framework for this project

**Rationale**:
- **Zero JS by Default**: Ships only HTML/CSS, adds JS selectively
- **Islands Architecture**: Perfect for content-heavy sites with selective interactivity
- **Excellent Performance**: Lighthouse scores 95-100 out of the box
- **SEO Excellence**: Static generation means perfect SEO
- **Framework Agnostic**: Can use React, Vue, Svelte together if needed
- **Vite-Based**: Fast development with HMR

**Best For**: Content-focused websites, marketing sites, luxury hotel sites

### Why React 19?
**Decision**: Used for interactive components only

**Rationale**:
- **Largest Ecosystem**: 44.7% market share, easy hiring
- **Familiar Patterns**: Most developers know React
- **Selective Use**: Only for dynamic features (forms, filters, mobile menu)
- **Server-Rendered**: Astro renders React components to HTML by default

**Used For**: Forms, gallery filters, mobile navigation

### Why TypeScript 5.9?
**Decision**: Full TypeScript implementation with strict mode

**Rationale**:
- **Type Safety**: Catch errors at compile time, not runtime
- **Better IDE Support**: Autocomplete, refactoring, navigation
- **Documentation**: Types serve as inline documentation
- **Refactoring**: Safer and easier code changes

**Configuration**: Strict mode enabled in `tsconfig.json`

### Why Tailwind CSS 3?
**Decision**: Utility-first CSS framework

**Rationale**:
- **Rapid Development**: Build UIs faster with utilities
- **Consistency**: Design tokens enforce brand consistency
- **Performance**: PurgeCSS removes unused styles
- **Responsive**: Mobile-first responsive utilities
- **Customization**: Easy to extend with custom colors/utilities

**Configuration**: Custom design system in `tailwind.config.mjs`

---

## 📁 Directory Structure Philosophy

```
src/
├── layouts/           # Page templates (HTML shells)
├── components/        # Reusable components
│   ├── *.astro       # Static Astro components
│   └── react/        # Interactive React components
├── pages/            # Routes (file-based routing)
└── styles/           # Global styles
```

**Principles**:
- **Layouts**: Shared HTML structure (header, meta tags)
- **Components**: Split by framework (.astro vs .tsx)
- **Pages**: Each file becomes a route automatically
- **Styles**: Minimal custom CSS, prefer Tailwind

---

## 🎨 Design System

### Color Palette

```javascript
// tailwind.config.mjs
colors: {
  primary: '#2c2c2c',    // Dark gray - sophistication, elegance
  secondary: '#8b7355',  // Earthy brown - warmth, grounded
  accent: '#d4af37',     // Luxury gold - premium, quality
  'text-dark': '#333',   // High readability
  'text-light': '#666',  // Secondary content
  'bg-light': '#f8f8f8', // Subtle backgrounds
}
```

**Usage**:
- Primary: Main text, dark backgrounds, navigation
- Secondary: Hover states, secondary elements
- Accent: CTAs, highlights, luxury touches
- Text colors: Content hierarchy
- Background: Section backgrounds, cards

### Typography System

**Font Stack**: `font-sans` = Helvetica Neue, Arial, sans-serif

**Weights**:
- 300 (Light): Headings for elegance
- 400 (Regular): Body text
- 500 (Medium): Labels, emphasis

**Scale** (Tailwind classes):
- `text-5xl md:text-6xl`: Hero headings
- `text-3xl md:text-4xl`: Section headings (h2)
- `text-xl md:text-2xl`: Sub-headings (h3)
- `text-base`: Body text

**Letter Spacing**:
- Use `tracking-wide` or `tracking-widest` for uppercase text
- Adds luxury feel and breathability

### Spacing System

Use Tailwind's spacing scale consistently:
- `p-8` (32px): Card padding
- `py-20` (80px): Section padding (mobile)
- `md:py-28` (112px): Section padding (desktop)
- `gap-10` (40px): Grid gaps
- `space-y-6` (24px): Vertical spacing

### Responsive Breakpoints

```css
sm: 640px   /* Rarely used, prefer md */
md: 768px   /* Tablets - main breakpoint */
lg: 1024px  /* Desktops */
xl: 1200px  /* Large screens - container max-width */
```

**Pattern**: Mobile-first, enhance with `md:` and `lg:`

---

## 🔧 Code Patterns & Conventions

### Astro Component Pattern

```astro
---
// Frontmatter: Imports, logic, data fetching
import BaseLayout from '../layouts/BaseLayout.astro';
import Navigation from '../components/Navigation.astro';

interface Props {
  title: string;
  description?: string;
}

const { title, description = 'Default' } = Astro.props;

const items = [
  { id: 1, name: 'Item 1' },
  { id: 2, name: 'Item 2' },
];
---

<!-- Template: HTML-like syntax with Tailwind -->
<BaseLayout {title} {description}>
  <Navigation />

  <section class="py-20 bg-white">
    <div class="container-custom">
      <h1 class="text-4xl text-primary">{title}</h1>

      {items.map(item => (
        <div class="p-4 bg-bg-light">{item.name}</div>
      ))}
    </div>
  </section>
</BaseLayout>

<style>
  /* Scoped styles (avoid if possible, use Tailwind) */
</style>
```

**Key Points**:
- Frontmatter runs at build time (server-side)
- Props typed with TypeScript interfaces
- Use `.map()` for lists, not `{#each}` (that's Svelte)
- Prefer Tailwind over scoped styles

### React Component Pattern

```typescript
// src/components/react/MyComponent.tsx
import { useState, FormEvent } from 'react';

interface MyComponentProps {
  initialValue?: number;
}

export default function MyComponent({ initialValue = 0 }: MyComponentProps) {
  const [count, setCount] = useState(initialValue);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Handle logic
  };

  return (
    <div className="p-8 bg-white rounded-lg">
      <button
        onClick={() => setCount(count + 1)}
        className="btn btn-primary"
      >
        Count: {count}
      </button>
    </div>
  );
}
```

**Key Points**:
- Use `className` not `class`
- Type all props with interfaces
- Prefer `function` declarations over arrow functions for exports
- Use TypeScript event types (`FormEvent`, `MouseEvent`, etc.)

### Using React in Astro

```astro
---
import MyComponent from '../components/react/MyComponent';
---

<!-- Hydration Strategies -->
<MyComponent client:load />        <!-- Immediate hydration -->
<MyComponent client:idle />        <!-- Hydrate when idle -->
<MyComponent client:visible />     <!-- Hydrate when visible -->

<!-- Pass Props -->
<MyComponent client:load initialValue={10} />
```

**Hydration Directives**:
- `client:load`: Critical interactive content (above fold)
- `client:idle`: Below-fold interactive content
- `client:visible`: Lazy load when scrolled into view
- Default (no directive): Renders to static HTML only

**Current Project**: Uses `client:load` for all interactive components

---

## 📄 Page Structure Template

Every page should follow this structure:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Navigation from '../components/Navigation.astro';
import Footer from '../components/Footer.astro';

// Page-specific imports and data
const pageTitle = "Page Title - KS Mansion";
---

<BaseLayout title={pageTitle}>
  <Navigation />

  <!-- Page Header -->
  <section class="page-header">
    <div class="page-header-content">
      <h1 class="text-4xl md:text-5xl font-light mb-4 tracking-wide">
        Page Title
      </h1>
      <p class="text-lg md:text-xl">Page description</p>
    </div>
  </section>

  <!-- Page Content -->
  <section class="py-20">
    <div class="container-custom">
      <!-- Content here -->
    </div>
  </section>

  <Footer />
</BaseLayout>
```

---

## 🎯 Feature Implementation Patterns

### Adding a New Page

1. **Create file** in `src/pages/`:
   ```
   src/pages/about.astro → /about route
   ```

2. **Use template** (see Page Structure Template above)

3. **Update Navigation**: Add link in `Navigation.astro` and `MobileMenu.tsx`

4. **Test**:
   - `npm run dev` - Check locally
   - `npm run build` - Verify builds without errors
   - Test responsive design at all breakpoints

### Adding a Form

1. **Create React component** in `src/components/react/`:
```typescript
import { useState, FormEvent } from 'react';

interface FormData {
  name: string;
  email: string;
}

export default function MyForm() {
  const [formData, setFormData] = useState<FormData>({ name: '', email: '' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form data:', formData);
    setMessage({ type: 'success', text: 'Form submitted!' });
    setFormData({ name: '', email: '' }); // Reset
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div className={`p-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full p-3 border rounded focus:border-accent"
        required
      />

      <button type="submit" className="btn btn-primary">
        Submit
      </button>
    </form>
  );
}
```

2. **Use in page**:
```astro
---
import MyForm from '../components/react/MyForm';
---

<MyForm client:load />
```

### Adding Interactive Component

**Decision Tree**:
- **Static content** → Astro component
- **Interactive/stateful** → React component
- **Simple interaction** → Astro with `<script>` tag
- **Complex state** → React component

**Example**: Gallery filter needs state management → React component

### Styling a Component

**Preferred Order**:
1. **Tailwind utilities** (90% of cases)
2. **Custom classes** in `global.css` using `@layer`
3. **Scoped styles** in `.astro` files (rare)
4. **Inline styles** for dynamic values only

**Example**:
```astro
<!-- Good: Tailwind utilities -->
<div class="p-8 bg-primary text-white rounded-lg hover:shadow-xl transition-all">

<!-- Acceptable: Custom class for reusable pattern -->
<button class="btn btn-primary">

<!-- Bad: Inline styles (unless dynamic) -->
<div style="padding: 2rem;">

<!-- Good: Dynamic inline style -->
<div style={{background: gradient}}>
```

---

## 🐛 Common Issues & Solutions

### Issue: React component not hydrating
**Solution**: Add `client:load` directive
```astro
<MyComponent client:load />
```

### Issue: TypeScript errors in .astro files
**Solution**: Run `npx astro check` to see detailed errors

### Issue: Tailwind classes not working
**Solution**:
1. Check `tailwind.config.mjs` content paths include your file
2. Restart dev server (`npm run dev`)
3. Ensure you're using `className` in React (not `class`)

### Issue: Build fails but dev works
**Solution**:
1. Check for `window` or `document` access outside React
2. Ensure all imports are correct
3. Run `npx astro check` for type errors

### Issue: Styles not applying correctly
**Solution**:
1. Check class name spelling
2. Ensure Tailwind classes are complete (`bg-primary` not `bg-prima`)
3. Check for conflicting global styles

---

## 🚀 Future Development Roadmap

### Phase 1: Content & Polish (Immediate)
- [ ] Replace placeholder gradients with real photos
- [ ] Add actual content and copy
- [ ] Professional photography
- [ ] SEO meta tags and Open Graph
- [ ] Image optimization (WebP, AVIF)

### Phase 2: Backend Integration (1-2 months)
- [ ] Reservation API (Node.js/Python + PostgreSQL)
- [ ] Email notifications (SendGrid)
- [ ] Admin dashboard (React/Next.js separate app)
- [ ] CMS integration (Sanity/Contentful)

### Phase 3: Enhanced Features (2-4 months)
- [ ] Real-time availability calendar
- [ ] Payment processing (Stripe)
- [ ] User authentication (Auth.js)
- [ ] Booking management
- [ ] Image lightbox for gallery

### Phase 4: Advanced (4-6 months)
- [ ] i18n (multi-language support)
- [ ] Virtual 360° tours
- [ ] Blog with CMS
- [ ] Reviews and ratings
- [ ] Analytics (Plausible/GA4)
- [ ] PWA capabilities

---

## 💡 AI Assistant Guidelines

### DO ✅

**Architecture**:
- Maintain Astro + React + TypeScript + Tailwind stack
- Use Astro for static content, React for interactivity
- Keep components small and focused
- Follow file structure conventions

**Code Quality**:
- Use TypeScript interfaces for all props and data
- Apply Tailwind utilities, avoid custom CSS
- Write accessible HTML (semantic tags, ARIA labels)
- Ensure mobile-first responsive design

**Best Practices**:
- Test at all breakpoints (mobile, tablet, desktop)
- Run `npm run build` before committing
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and pure where possible

**Performance**:
- Use `client:visible` or `client:idle` for below-fold components
- Lazy load images when adding real photos
- Minimize React component size
- Prefer static Astro components when possible

### DON'T ❌

**Architecture**:
- Don't add new frameworks without discussion
- Don't use CSS-in-JS libraries (styled-components, emotion)
- Don't create `.css` files (use Tailwind or `global.css`)
- Don't use jQuery or other legacy libraries

**Code Practices**:
- Don't use `any` type in TypeScript
- Don't add inline styles except for dynamic values
- Don't create overly complex components
- Don't duplicate code (extract to shared components)

**Performance**:
- Don't use `client:only` (breaks SSR)
- Don't import entire libraries (tree-shake)
- Don't add heavy dependencies without justification
- Don't use `useEffect` for everything (use native Web APIs)

**Styling**:
- Don't create custom CSS files per component
- Don't use `!important` in styles
- Don't hard-code colors (use Tailwind tokens)
- Don't create conflicting global styles

---

## 🧪 Testing Checklist

Before committing changes:

### Functionality
- [ ] All pages load without errors
- [ ] Forms submit and validate correctly
- [ ] Navigation works (desktop and mobile)
- [ ] Interactive components hydrate properly
- [ ] Links go to correct destinations

### Responsive Design
- [ ] Desktop (1920px, 1440px, 1024px)
- [ ] Tablet (768px)
- [ ] Mobile (375px, 414px)
- [ ] Navigation collapses on mobile
- [ ] Touch interactions work
- [ ] No horizontal scroll

### TypeScript
- [ ] `npx astro check` passes
- [ ] No type errors in IDE
- [ ] All props properly typed

### Build
- [ ] `npm run build` succeeds
- [ ] No build warnings
- [ ] `npm run preview` works

### Performance
- [ ] No console errors
- [ ] Fast page loads
- [ ] Smooth animations
- [ ] Small JavaScript bundles

### Accessibility
- [ ] Keyboard navigation works
- [ ] Semantic HTML used
- [ ] Alt text on images
- [ ] Color contrast sufficient

---

## 📚 Resources & References

### Official Documentation
- [Astro Documentation](https://docs.astro.build/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### Design Inspiration
- [Aman Hotels](https://www.aman.com/)
- [Four Seasons](https://www.fourseasons.com/)
- [Luxury Hotel Design Best Practices](https://mediaboom.com/news/luxury-hotel-website-design/)

### Learning Resources
- [Astro Islands Architecture](https://docs.astro.build/en/concepts/islands/)
- [TypeScript with React](https://react-typescript-cheatsheet.netlify.app/)
- [Tailwind CSS Best Practices](https://tailwindcss.com/docs/reusing-styles)

---

## 🔐 Security Considerations

### Current (Static Site)
- No sensitive data storage
- Client-side validation only (UX, not security)
- No authentication system yet

### Future (With Backend)
- [ ] Server-side validation for all forms
- [ ] HTTPS for all traffic
- [ ] Input sanitization
- [ ] CSRF protection
- [ ] Rate limiting on APIs
- [ ] Secure payment gateway (PCI compliance)
- [ ] Environment variables for secrets
- [ ] SQL injection prevention (parameterized queries)

---

## 📞 Support & Maintenance

### Making Updates

**Content Changes**:
- Update `.astro` files directly
- Rebuild with `npm run build`

**Style Changes**:
- Modify Tailwind config for design tokens
- Add utilities in `global.css` using `@layer`

**New Features**:
- Follow patterns documented in this file
- Add to appropriate directory (`components/react/` or `components/`)
- Update tests and documentation

### Performance Monitoring

Tools to use:
- Lighthouse (Chrome DevTools)
- WebPageTest
- PageSpeed Insights
- Astro Dev Toolbar

Target metrics:
- Largest Contentful Paint (LCP): < 2.5s
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1
- Time to Interactive (TTI): < 3.5s

---

## 🎓 Learning Path for Contributors

### Beginner
1. Learn HTML/CSS basics
2. Understand Tailwind utility classes
3. Read Astro "Getting Started" docs
4. Practice with `.astro` components

### Intermediate
1. Learn TypeScript fundamentals
2. Understand React hooks (useState, useEffect)
3. Study Astro Islands architecture
4. Practice with React + TypeScript

### Advanced
1. Astro SSR and API routes
2. Performance optimization techniques
3. Advanced TypeScript (generics, utility types)
4. Build systems and deployment

---

**Maintained By**: Development Team
**Project Start**: November 2025
**Last Major Update**: November 23, 2025
**Version**: 2.0.0 (Modern Stack)

**Note**: This document should be updated whenever:
- New patterns are established
- Architecture decisions are made
- Major features are added
- Best practices change

Keep this file as a single source of truth for the project's architecture and development practices.
