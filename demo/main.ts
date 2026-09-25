import { createApp } from "vue";
import { App } from "./App";
import "./demo.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createApp(App).mount(root);
