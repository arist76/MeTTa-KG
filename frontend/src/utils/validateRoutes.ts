import routes from "~/pages/routes"; // adjust if your routes are defined elsewhere

export function validateRoutes() {
  routes.forEach((r) => {
    if (!r.component) {
      console.warn(`Route ${r.path} has no component!`);
    } else if (typeof r.component !== "function") {
      console.error(`Route ${r.path} component is not a function!`, r.component);
    }
  });
}
