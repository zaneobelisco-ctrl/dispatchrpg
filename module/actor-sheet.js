// module/actor-sheet.js - Dispatch RPG: actor sheet logic (autosave on close, computed fields, robust rolls)
export class DispatchActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 920,
      height: 760,
      resizable: true,
      submitOnClose: true
    });
  }

  /** 
   * Antes de fechar, salva explicitamente os dados do formulário.
   */
  async close(options = {}) {
    try {
      await this.saveSheetData();
      // pequeno delay para garantir que o update foi iniciado
      await new Promise(r => setTimeout(r, 70));
    } catch (err) {
      console.warn("DispatchRPG | Erro ao salvar ficha antes de fechar:", err);
      ui.notifications.error("Não foi possível salvar automaticamente a ficha. Verifique o console.");
    }
    return super.close(options);
  }

  getData() {
    const data = super.getData();

    // Ensure attributes
    data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    // Default pericias
    const defaultPericias = {
      "Atletismo": 0,
      "Condução": 0,
      "Desarmado": 0,
      "Dissimulação": 0,
      "Evasão": 0,
      "Vontade": 0,
      "Furtividade": 0,
      "Influência": 0,
      "Intuição": 0,
      "Língua Nativa": 0,
      "Malandragem": 0,
      "Musculatura": 0,
      "Ocultação": 0,
      "Pesquisa": 0,
      "Percepção": 0,
      "Primeiros Socorros": 0
    };
    data.data.pericias = data.data.pericias || {};
    for (let k of Object.keys(defaultPericias)) {
      if (data.data.pericias[k] === undefined) data.data.pericias[k] = defaultPericias[k];
    }

    // Ensure status defaults
    data.data.pv = data.data.pv ?? 0;
    data.data.pp = data.data.pp ?? 0;
    data.data.san = data.data.san ?? 0;

    // Computed fields for template
    const des = Number(data.data.atributos.DES) || 0;
    const vig = Number(data.data.atributos.VIG) || 0;
    data.computed = data.computed || {};
    data.computed.iniciativaBonus = des;
    data.computed.taxaCuraBonus = vig;
    // Movement formula: base 6 + DES
    data.computed.movimento = 6 + des;

    // helpers for template iteration
    data._attrKeys = Object.keys(data.data.atributos);
    data._periciasKeys = Object.keys(data.data.pericias);

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = this.element;

    // Upload photo
    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));

    // Rolls - delegated handlers
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));

    // Double click increment/decrement for skill inputs
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
      const match = name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      const newPericias = duplicate(this.actor?.system?.pericias || this.actor?.data?.data?.pericias || this.actor?.data?.pericias || {});
      newPericias[skillName] = newVal;
      await this.actor.update({ "data": { "pericias": newPericias } });
      $(input).val(newVal);
      ui.notifications.info(`${skillName}: ${newVal}`);
    });

    // Auto-save small edits on blur (keeps UX snappy)
    root.on("blur", "input, textarea", (ev) => {
      const form = this.element.find("form");
      if (form.length) form.submit();
    });
  }

  // helper: robust actor lookup
  _getActorFromContext() {
    if (this.actor) return this.actor;
    try {
      const el = this.element.closest(".app");
      const actorId = el?.dataset?.actorId || this.element.attr("data-actor-id");
      if (actorId) {
        const actor = game.actors.get(actorId) || canvas.tokens?.get(actorId)?.actor;
        if (actor) return actor;
      }
    } catch (err) { /* ignore */ }
    // fallback: any rendered actor sheet
    const found = game.actors?.contents?.find?.(a => a.sheet?._state?.rendered);
    if (found) return found;
    return null;
  }

  // Helper: get current value from sheet input if present, otherwise from actor data
  _getFieldValueFromSheetOrActor(fieldName) {
    try {
      const selector = `[name="${fieldName}"]`;
      const el = this.element.find(selector);
      if (el && el.length) {
        const v = el.val();
        if (v !== undefined && v !== null && v !== "") return Number(v);
      }
    } catch (err) {
      // ignore selector errors
    }

    const actor = this._getActorFromContext();
    if (!actor) return 0;
    const actorSys = actor.system || actor.data?.data || actor.data || {};
    const parts = fieldName.split(".");
    const startIdx = parts[0] === "data" ? 1 : 0;
    let cur = actorSys;
    for (let i = startIdx; i < parts.length; i++) {
      const key = parts[i];
      if (cur == null) return 0;
      if (cur[key] === undefined) {
        const foundKey = Object.keys(cur).find(k => k === key);
        if (foundKey) cur = cur[foundKey];
        else return 0;
      } else cur = cur[key];
    }
    return Number(cur) || 0;
  }

  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: (path) => {
        const actor = this._getActorFromContext();
        if (!actor) return ui.notifications.warn("Salve a ficha primeiro para definir a foto.");
        actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  // Perícia roll
  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida.");

    const map = {
      "Atletismo": "FOR",
      "Condução": "DES",
      "Desarmado": "FOR",
      "Dissimulação": "CAR",
      "Evasão": "DES",
      "Vontade": "POD",
      "Furtividade": "DES",
      "Influência": "CAR",
      "Intuição": "INT",
      "Língua Nativa": "INT",
      "Malandragem": "POD",
      "Musculatura": "FOR",
      "Ocultação": "INT",
      "Pesquisa": "INT",
      "Percepção": "INT",
      "Primeiros Socorros": "INT"
    };

    const periciaVal = this._getFieldValueFromSheetOrActor(`data.pericias.${skill}`);
    const attrKey = map[skill] || "FOR";
    const attrVal = this._getFieldValueFromSheetOrActor(`data.atributos.${attrKey}`);

    const formula = `1d20 + ${attrVal} + ${periciaVal}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      const speaker = actor ? ChatMessage.getSpeaker({ actor }) : {};
      const flavor = `${actor?.name || "Personagem"} — ${skill} (1d20 + ${attrVal} + ${periciaVal})`;
      roll.toMessage({ speaker, flavor });
    } catch (err) {
      console.error("Error rolling skill:", err);
      ui.notifications.error("Erro ao rolar a perícia.");
    }
  }

  // Iniciativa = 1d20 + DES
  async _onRollIniciativa(event) {
    event.preventDefault();
    const des = this._getFieldValueFromSheetOrActor("data.atributos.DES");
    const formula = `1d20 + ${des}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      roll.toMessage({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : {}, flavor: `${actor?.name || "Personagem"} — Iniciativa` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar iniciativa.");
    }
  }

  // Taxa de cura = 1d6 + VIG
  async _onRollTaxaCura(event) {
    event.preventDefault();
    const vig = this._getFieldValueFromSheetOrActor("data.atributos.VIG");
    const formula = `1d6 + ${vig}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      roll.toMessage({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : {}, flavor: `${actor?.name || "Personagem"} — Taxa de Cura (1d6 + ${vig})` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar taxa de cura.");
    }
  }

  /**
   * Lê o formulário renderizado, expande nomes como "data.atributos.FOR" em objeto aninhado,
   * converte strings numéricas em números e executa this.actor.update(...) com o payload.
   * Evita incluir entradas vazias (""), preservando os valores existentes no actor.
   */
  async saveSheetData() {
    const actor = this._getActorFromContext() || this.actor;
    if (!actor) return ui.notifications.warn("Não foi possível salvar: personagem não encontrado.");

    const formEl = this.element.find("form")[0];
    if (!formEl) return;

    // Ler FormData
    const fd = new FormData(formEl);
    const entries = Array.from(fd.entries()); // [ [name, value], ... ]

    // Montar flat object, IGNORANDO entradas vazias (""), mas mantendo "0"
    const flat = {};
    for (const [k, v] of entries) {
      if (typeof v === "string" && v.trim() === "") continue;
      flat[k] = v;
    }

    // expandObject helper (Foundry fornece expandObject ou foundry.utils.expandObject)
    const expandFn = (typeof expandObject === "function") ? expandObject : (foundry?.utils?.expandObject);
    if (!expandFn) {
      console.error("DispatchRPG | expandObject não disponível no ambiente Foundry.");
      return;
    }
    const expanded = expandFn(flat); // exemplo: { data: { atributos: { FOR: "3" }, pericias: { "Primeiros Socorros": "2" } }, name: "..." }

    // Converter numerics em strings para numbers (recursivo)
    function convertNumbers(obj) {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === "string") {
        if (/^-?\d+$/.test(obj)) return parseInt(obj, 10);
        if (/^-?\d+\.\d+$/.test(obj)) return parseFloat(obj);
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(convertNumbers);
      if (typeof obj === "object") {
        const out = {};
        for (const key of Object.keys(obj)) out[key] = convertNumbers(obj[key]);
        return out;
      }
      return obj;
    }
    const converted = convertNumbers(expanded);

    // Construir payload: incluir data (se existir) e quaisquer outros campos de topo (ex.: name)
    const payload = {};
    if (converted.data) payload.data = converted.data;
    for (const k of Object.keys(converted)) {
      if (k === "data") continue;
      payload[k] = converted[k];
    }

    // Se payload estiver vazio, não chamar update
    if (Object.keys(payload).length === 0) return;

    // Executar update
    await actor.update(payload);
  }
}
