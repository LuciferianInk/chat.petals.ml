const models = {
  "artek0chumak/guanaco-65b": {
    modelCard: "https://huggingface.co/timdettmers/guanaco-65b",
    license: "https://huggingface.co/timdettmers/guanaco-65b",
    sepToken: "###",
    stopToken: "###",
    extraStopSequences: ["</s>"],
  },
  "enoch/llama-65b-hf": {
    modelCard: "https://github.com/facebookresearch/llama/blob/main/MODEL_CARD.md",
    license: "https://bit.ly/llama-license",
    sepToken: "\n\n",
    stopToken: "\n\n",
    extraStopSequences: null,
  }
};
var curModel = "enoch/llama-65b-hf";

const generationParams = {
  do_sample: 1,
  temperature: 1.023,
  top_k: 40,
  // penalty_alpha: 0.6,
  // repetition_penalty: 2.3,
  // encoder_repetition_penalty: 2.3,
  // no_repeat_ngram_size: 4,
  // encoder_no_repeat_ngram_size: 0,
  // renormalize_logits: true
};

var ws = null;
var position = 0;
var sessionMaxLength = 1024;

var totalElapsed, nRequests;

const mode = {
  CHATBOT: 1,
  FEW_SHOT: 2,
};
let current_mode = mode.CHATBOT;
let stop = false;

function openSession() {
  let secure = 'ws'
  if (location.protocol === 'https:') {
    secure = 'wss'
  }
  ws = new WebSocket(`${secure}://${location.host}/api/v2/generate`);
  ws.onopen = () => {
    ws.send(JSON.stringify({type: "open_inference_session", model: curModel, max_length: sessionMaxLength}));
    ws.onmessage = event => {
      const response = JSON.parse(event.data);
      if (!response.ok) {
        handleFailure(response.traceback);
        return;
      }

      sendReplica();
    };
  };

  ws.onerror = _event => handleFailure(`Connection failed`);
  ws.onclose = _event => {
    if ($(".error-box").is(":hidden")) {
      handleFailure(`Connection was closed`);
    }
  };
}

function resetSession() {
  if (ws !== null && ws.readyState <= 1) {  // If readyState is "connecting" or "opened"
    ws.close();
  }
  ws = null;
  position = 0;
}

function isWaitingForInputs() {
  return $('.human-replica textarea').length >= 1;
}

function sendReplica() {
  if (isWaitingForInputs()) {
    const aiPrompt = (current_mode === mode.CHATBOT) ? 'Devel:' : '';
    $('.human-replica:last').text($('.human-replica:last textarea').val());
    $('.dialogue').append($(
      '<p class="ai-replica">' +
        `<span class="text">${aiPrompt}</span>` +
        '<span class="loading-animation"></span>' +
      '</p>'));
    animateLoading();
    $('.stop-generation').click(e => {
      e.preventDefault();
      console.log("Stop generation");
      stop = true;
    });
  } else {
    $('.loading-animation').show();
  }

  if (ws === null) {
    openSession();
    return;
  }

  const replicaDivs = $('.human-replica, .ai-replica .text');
  var replicas = [];
  for (var i = position; i < replicaDivs.length; i++) {
    const el = $(replicaDivs[i]);
    var phrase = el.text();
    if (el.is(".human-replica")) {
      phrase += models[curModel].sepToken;
    } else
    if (i < replicaDivs.length - 1) {
      phrase += models[curModel].stopToken;
    }
    replicas.push(phrase);
  }
  const inputs = replicas.join("");
  position = replicaDivs.length;

  totalElapsed = 0;
  nRequests = 0;
  receiveReplica(inputs);
}

function receiveReplica(inputs) {
  ws.send(JSON.stringify({
    type: "generate",
    inputs: inputs,
    max_new_tokens: 1,
    stop_sequence: models[curModel].stopToken,
    extra_stop_sequences: models[curModel].extraStopSequences,
    ...generationParams
  }));

  var lastMessageTime = null;
  ws.onmessage = event => {
    const response = JSON.parse(event.data);
    if (!response.ok) {
      handleFailure(response.traceback);
      return;
    }

    if (lastMessageTime != null) {
      totalElapsed += performance.now() - lastMessageTime;
      nRequests++;
    }
    lastMessageTime = performance.now();

    const lastReplica = $('.ai-replica .text').last();
    var newText = lastReplica.text() + response.outputs;
    newText = newText.replace(models[curModel].stopToken, "");
    if (models[curModel].extraStopSequences !== null) {
      for (const seq of models[curModel].extraStopSequences) {
        newText = newText.replace(seq, "");
      }
    }
    lastReplica.text(newText);

    if (!response.stop && !stop) {
      if (nRequests >= 1) {
        const speed = nRequests / (totalElapsed / 1000);
        $('.speed')
        .text(`Speed: ${speed.toFixed(1)} tokens/sec`)
          .show();
          if (speed < 0.5) {
          $('.suggest-join').show();
        }
      }
    } else {
      $('.loading-animation, .speed, .suggest-join, .generation-controls').remove();
      resetSession();
      appendTextArea();
      stop = false;
    }
  };
}

function handleFailure(message) {
  resetSession();
  if (!isWaitingForInputs()) {
    // Show the error and the retry button only if a user is waiting for the generation results
    var autoRetry = false;
    if (/Session .+ expired/.test(message)) {
      autoRetry = true;
    }
    const largerMaxLength = 2048;
    if (/Maximum length exceeded/.test(message) && sessionMaxLength < largerMaxLength) {
      sessionMaxLength = largerMaxLength;  // We gradually increase sessionMaxLength to save server resources
      autoRetry = true;
    }

    if (autoRetry) {
      retry();
    } else {
      $('.loading-animation').hide();
      $('.error-message').text(message);
      $('.error-box').show();
    }
  }
}

function retry() {
  $('.error-box').hide();
  sendReplica();
}

function appendTextArea() {
  const humanPrompt = (current_mode === mode.CHATBOT) ? "Research: " : "";
  $('.dialogue').append($(
    `<p class="human-replica"><textarea class="form-control" id="exampleTextarea" rows="2">${humanPrompt}</textarea></p>`
  ));
  upgradeTextArea();
}

function upgradeTextArea() {
  const textarea = $('.human-replica textarea');
  autosize(textarea);
  textarea[0].selectionStart = textarea[0].value.length;
  textarea.focus();

  textarea.on('keypress', e => {
    if (e.which == 13 && !e.shiftKey) {
      e.preventDefault();
      sendReplica();
    }
  });
}

function resetDialogue() {
  if (!isWaitingForInputs()) {
    alert("Can't reset the dialogue while the AI is writing a response. Please refresh the page");
    return false;
  }
  if (!confirm("This will reset the dialogue. Are you sure?")) {
    return false;
  }

  $('.dialogue').empty();
  appendTextArea();

  resetSession();
  return true;
}

const animFrames = ["⠠","⠏","⠲","⠢","⠐","⠕","⠥","⠭","⠞","⠱","⠟","⠒","⠇","⠙","⠮","⠪","⠑","⠷","⠿","⠊","⠂","⠅","⠡","⠬","⠝","⠰","⠽","⠻","⠧","⠃","⠼","⠹","⠌","⠵","⠄","⠎","⠫","⠳","⠯","⠗","⠉","⠁","⠛","⠸","⠋","⠺","⠔","⠓","⠜","⠆","⠍",];

var curFrame = 0;

function animateLoading() {
  $('.loading-animation').html(' &nbsp;' + animFrames[curFrame]);
  curFrame = (curFrame + 1) % animFrames.length;
}

$(() => {
  upgradeTextArea();

  $('.show-few-shot').click(e => {
    e.preventDefault();
    current_mode = mode.FEW_SHOT;

    if (resetDialogue()) {
      const textarea = $('.human-replica textarea');
      textarea.val(
        'Research: A cat sat on a mat.\n\n' +
        'Devel: Un gato se sentó en una estera.\n\n' +
        'Research: A brown fox jumps over the lazy dog.\n\n' +
        'Devel: Un zorro marrón salta sobre el perro perezoso.\n\n' +
        'Research: Who is the president of the United States?'
      );
      textarea[0].style.height = textarea[0].scrollHeight + "px";
      textarea.focus();
    }
  });
  $('.retry-link').click(e => {
    e.preventDefault();
    retry();
  });
  $('.switch-model').click(e => {
    e.preventDefault();
    if (!isWaitingForInputs()) {
      alert("Can't switch the model while the AI is writing a response. Please refresh the page");
      return false;
    }

    const prevModel = curModel;
    // curModel = curModel === "enoch/llama-65b-hf";
    resetSession();

    $('.other-model-name').text(models[prevModel].name);
    $('.model-name')
      .text(models[curModel].name)
      .attr('href', models[curModel].href);
    $('.human-replica textarea').focus();
  });

  setInterval(animateLoading, 2000);
});
