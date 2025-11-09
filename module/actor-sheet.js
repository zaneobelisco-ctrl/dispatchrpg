// module/actor-sheet.js - Dispatch RPG: actor sheet logic (final robust save + logging + foundry.utils)
export class DispatchActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 920,
      height: 760,
      resizable: true,
      submitOnClose: true
    });
  }

  async close(options = {}) {
    try {
      await this.saveSheetData();
      await new Promise(r => setTimeout(r, 70));
    } catch (err) {
      console.warn("DispatchRPG | Erro ao salvar ficha antes de fechar:", err);
      ui.notifications.error("Não foi possível salvar automaticamente a ficha. Verifique o console.");
    }
    return super.close(options);
  }

  getData() {
    const data = super.getData();
    data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    const defaultPericias = {
      "Atletismo": 0,"Condução": 0,"Desarmado": 0,"Dissimulação": 0,"Evasão": 0,"Vontade": 0,
      "Furtividade": 0,"Influência": 0,"Intuição": 0,"Língua Nativa": 0,"Malandragem": 0,
      "Musculatura": 0,"Ocultação": 0,"Pesquisa": 0,"Percepção": 0,"Primeiros Socorros": 0
    };
    data.data.pericias = data.data.pericias || {};
    for (let k of Object.keys(defaultPericias)) {
      if (data.data.pericias[k] === undefined) data.data.pericias[k] = defaultPericias[k];
    }

    data.data.pv = data.data.pv ?? 0;
    data.data.pp = data.data.pp ?? 0;
    data.data.san = data.data.san ?? 0;

    const des = Number(data.data.atributos.DES) || 0;
    const vig = Number(data.data.atributos.VIG) || 0;
    data.computed = data.computed || {};
    data.computed.iniciativaBonus = des;
    data.computed.taxaCuraBonus = vig;
    data.computed.movimento = 6 + des;

    data._attrKeys = Object.keys(data.data.atributos);
    data._periciasKeys = Object.keys(data.data.pericias);

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = this.element;

    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));

    root.on("click", ".btn-save-sheet", async (ev) => {
      ev.preventDefault();
      try {
        await this.saveSheetData();
        ui.notifications.info("Ficha salva.");
      } catch (err) {
        console.error("DispatchRPG | Erro ao salvar via botão:", err);
        ui.notifications.error("Erro ao salvar (ver console).");
      }
    });

    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
      const match = name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      const base = this.actor?.system?.pericias || this.actor?.data?.data?.pericias || this.actor?.data?.pericias || {};
      const newPericias = foundry.utils.duplicate(base);
      newPericias[skillName] = newVal;
      try {
        await this.actor.update({ "data": { "pericias": newPericias } });
        $(input).val(newVal);
        ui.notifications.info(`${skillName}: ${newVal}`);
      } catch (err) {
        console.error("DispatchRPG | Erro ao atualizar perícias:", err);
        ui.notifications.error("Erro ao atualizar perícias (ver console).");
      }
    });

    root.on("blur", "input, textarea", (ev) => {
      // Do not auto-submit here to avoid racing; prefer explicit Save button or close() save.
    });
  }

  _getActorFromContext() {
    if (this.actor) return this.actor;
    try {
      const el = this.element.closest(".app");
      const actorId = el?.dataset?.actorId || this.element.attr("data-actor-id");
      if (actorId) {
        const actor = game.actors.get(actorId) || canvas.tokens?.get(actorId)?.actor;
        if (actor) return actor;
      }
    } catch (err) {}
    const found = game.actors?.contents?.find?.(a => a.sheet?._state?.rendered);
    if (found) return found;
    return null;
  }

  _getFieldValueFromSheetOrActor(fieldName) {
    try {
      const selector = `[name="${fieldName}"]`;
      const el = this.element.find(selector);
      if (el && el.length) {
        const v = el.val();
        if (v !== undefined && v !== null && v !== "") return Number(v);
      }
    } catch (err) {}
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

  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida.");
    const map = {"Atletismo":"FOR","Condução":"DES","Desarmado":"FOR","Dissimulação":"CAR","Evasão":"DES","Vontade":"POD","Furtividade":"DES","Influência":"CAR","Intuição":"INT","Língua Nativa":"INT","Malandragem":"POD","Musculatura":"FOR","Ocultação":"INT","Pesquisa":"INT","Percepção":"INT","Primeiros Socorros":"INT"};
    const periciaVal = this._getFieldValueFromSheetOrActor(`data.pericias.${skill}`);
    const attrKey = map[skill] || "FOR";
    const attrVal = this._getFieldValueFromSheetOrActor(`data.atributos.${attrKey}`);
    const formula = `1d20 + ${attrVal} + ${periciaVal}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const actor = this._getActorFromContext();
      roll.toMessage({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : {}, flavor: `${actor?.name || "Personagem"} — ${skill} (1d20 + ${attrVal} + ${periciaVal})` });
    } catch (err) {
      console.error("DispatchRPG | Erro na rolagem:", err);
      ui.notifications.error("Erro ao rolar (ver console).");
    }
  }

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
      ui.notifications.error("Erro ao rolar iniciativa (ver console).");
    }
  }

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
      ui.notifications.error("Erro ao rolar taxa de cura (ver console).");
    }
  }

  // Final, robust save that logs payload and has fallback manual collection
  async saveSheetData() {
    const actor = this._getActorFromContext() || this.actor;
    if (!actor) {
      ui.notifications.warn("Não foi possível salvar: personagem não encontrado.");
      return;
    }

    // Permission check
    if (!actor.isOwner && !(game.user?.isGM)) {
      ui.notifications.warn("Você não tem permissão para editar este personagem.");
      return;
    }

    // Try FormData + foundry.utils.expandObject first
    const formEl = this.element.find("form")[0];
    let flat = {};
    if (formEl) {
      const fd = new FormData(formEl);
      const entries = Array.from(fd.entries());
      for (const [k,v] of entries) {
        if (typeof v === "string" && v.trim() === "") continue;
        flat[k] = v;
      }
    }

    // Fallback manual collection: find all inputs with name attributes
    if (!Object.keys(flat).length) {
      const inputs = this.element.find('input[name], textarea[name], select[name]');
      inputs.each((i,el) => {
        const name = el.getAttribute('name');
        if (!name) return;
        const val = el.value;
        if (typeof val === "string" && val.trim() === "") return;
        flat[name] = val;
      });
    }

    // If still empty, nothing to save
    if (!Object.keys(flat).length) {
      console.debug("DispatchRPG | saveSheetData: nenhum campo a salvar.");
      return;
    }

    // Try to expand using foundry.utils.expandObject
    let expanded = {};
    try {
      if (foundry?.utils?.expandObject) expanded = foundry.utils.expandObject(flat);
      else expanded = expandObject(flat); // fallback (if available)
    } catch (err) {
      console.warn("DispatchRPG | expandObject falhou, usando expansão manual.", err);
      // manual expansion of dotted keys into nested object
      expanded = {};
      for (const key of Object.keys(flat)) {
        const parts = key.split('.');
        let cur = expanded;
        for (let i=0;i<parts.length;i++) {
          const p = parts[i];
          if (i === parts.length - 1) {
            cur[p] = flat[key];
          } else {
            cur[p] = cur[p] || {};
            cur = cur[p];
          }
        }
      }
    }

    // Convert numeric strings -> numbers
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
        for (const k of Object.keys(obj)) out[k] = convertNumbers(obj[k]);
        return out;
      }
      return obj;
    }
    const converted = convertNumbers(expanded);

    // Build payload: include data and top-level fields like name
    const payload = {};
    if (converted.data) payload.data = converted.data;
    for (const k of Object.keys(converted)) {
      if (k === "data") continue;
      payload[k] = converted[k];
    }

    console.debug("DispatchRPG | saveSheetData payload:", payload);

    if (!Object.keys(payload).length) {
      console.debug("DispatchRPG | payload vazio, nada a atualizar.");
      return;
    }

    try {
      await actor.update(payload);
      console.debug("DispatchRPG | actor.update bem sucedido.");
    } catch (err) {
      console.error("DispatchRPG | actor.update falhou:", err);
      ui.notifications.error("Falha ao salvar ficha. Veja o Console para detalhes.");
      throw err;
    }
  }
}
