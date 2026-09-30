import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { reloadOnServiceWorkerUpdate } from "./lib/urlLoaders";

reloadOnServiceWorkerUpdate();

export const app = mount(App, {
  target: document.getElementById("app")!,
});
