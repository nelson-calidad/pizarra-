# Decisiones técnicas

El pizarrón se orienta a tarjetas de notas, no a edición gráfica. Excalidraw y BlockSuite Edgeless son potentes, pero incorporan un modelo de documento demasiado complejo para datos que deben persistirse en Google Sheets.

Se eligió React con posiciones absolutas y `react-zoom-pan-pinch` para la siguiente mejora de pan/zoom: es una capa pequeña, mantenida y adecuada para tarjetas React personalizadas. La primera versión conserva esa arquitectura sin una dependencia crítica para funcionar aun sin conexión. Las posiciones X/Y y dimensiones son datos propios de cada nota.
