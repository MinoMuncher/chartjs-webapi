import { Chart } from 'chart.js/auto'
import { createCanvas } from '@napi-rs/canvas'
import ChartDataLabels, { type Context } from 'chartjs-plugin-datalabels';
import { plugin } from 'bun';

console.log("Hello via Bun!");
Chart.defaults.font.size = 20
Chart.defaults.color = '#f9f6f2'
Chart.defaults.borderColor = '#91908E'

let scale = false;
const BAR_OPTIONS = {
  maintainAspectRatio: false,
  layout: {
    padding: 10,
  },
  scales: {
    x: {
      stacked: true,
    },
    y: {
      stacked: true,
      max: 100,
      ticks: {
        callback: function (val: string, _index: any) {
          return val + '%';
        },
      }
    }
  },
  plugins: {
    title: {
      text: "Line Clear Distribution",
      display: true,
      align: 'start'
    },
    legend: {
      display: true,
      position: 'right',
      reverse: true,
      align: 'start',
      maxWidth: 100 * 7,
    },
  }
};
const WELL_OPTIONS = {
  layout: {
    padding: 10,
  },
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      //   max: scale ? Math.max(...stats.wellColumns)/total + 0.04 : 0.4
    }
  },
  plugins: {
    datalabels: {
      color: 'white',
      font: {
        weight: 'bold'
      },
      anchor: 'start',
      align: 'end',
      offset: 20,
      formatter(value: number, _context: Context) {
        return `${Math.round(value * 100)}%`
      }
    }
  }
};
const RADAR_OPTIONS = {
  plugins: {
    datalabels: {
      color: "#f9f6f2",
      borderRadius: 4,
      backgroundColor: function (context: Context) {
        return context.dataset.backgroundColor;
      },
      borderWidth: 1,
      borderColor: function (context: Context) {
        return context.dataset.borderColor;
      },
      align: 'end',
    }
  },
  layout: {
    padding: 20
  },
  devicePixelRatio: 4,
  elements: {
    line: {
      borderWidth: 3
    }
  },
  scales: {
    r: {
      beginAtZero: true,
      max: 1,
      ticks: {
        display: false,
        maxTicksLimit: 20
      }
    }
  },
}


function generateOffsets(datasets: { data: number[], index: number }[]) {
  let offsets = datasets.map(x => [...x.data])
  if (datasets.length <= 1) return offsets
  for (let i = 0; i < datasets[0].data.length; i += 1) {
    let tolerance = 0.2
    if (datasets[0].data.length % 2 == 0) {
      if (i == 0 || i == datasets[0].data.length / 2) {
        tolerance = 0.15
      }
    }
    datasets.sort((a, b) => a.data[i] - b.data[i])
    for (let j = 1; j < datasets.length; j += 1) {
      const J = datasets[j].index
      const K = datasets[j - 1].index
      const offset = datasets[j].data[i] - offsets[K][i]
      if (offset >= 0 && offset < tolerance) {
        offsets[J][i] = offsets[K][i] + tolerance
      } else if (offset < 0) {
        offsets[J][i] = offsets[K][i] + tolerance
      }
    }
  }
  return offsets
}

function createGraph(graphData: any, canvas: any, destCanvas: any, pos: { x: number, y: number }) {

  let offsets = generateOffsets(graphData.data.datasets.map((x: any, index: any) => { return { data: x.data, index } }));

  let set: any = {
    type: graphData.type,
    data: graphData.data,
  };


  switch (graphData.optionType) {
    case "well":
      set.options = WELL_OPTIONS;
      set.plugins = [ChartDataLabels];
      set.options.scales.y.max = graphData.scaleYMax;
      break;
    case "bar":
      set.options = BAR_OPTIONS;
      break;
    case "radar":

      set.plugins = [ChartDataLabels];
      set.options = RADAR_OPTIONS;

      set.options.plugins.datalabels.formatter = function (value: any, context: { dataIndex: any }) {
        let min = graphData.min[context.dataIndex];
        let max = graphData.max[context.dataIndex];
        let range = max - min;
        let trueValue = value * range + min;

        switch (graphData.formatTypes[context.dataIndex]) {
          case "toFixed2":
            return String(trueValue.toFixed(2));
          case "round":
            return String(Math.round(trueValue));
          case "percentage":
            return `${Math.floor(trueValue * 100)}%`;
          case "percentageToFixed2":
            return `${((trueValue * 100).toFixed(2))}%`;
          default:
            return "err";
        }

      }

      set.options.plugins.datalabels.offset = function (context: Context) {
        let before = graphData.data.datasets[context.datasetIndex].data[context.dataIndex];
        let after = 160 * (offsets[context.datasetIndex][context.dataIndex] - graphData.data.datasets[context.datasetIndex].data[context.dataIndex]);
        return after;
      }

      break;

    default:
      console.log("想定外");
      return;
      break;
  }

  let chart = new Chart(canvas, set);

  var ctx = canvas.getContext("2d");

  ctx.globalCompositeOperation = 'destination-over'

  ctx.fillStyle = "#292929";
  ctx.beginPath();
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //console.log("aaaaaaaa");
  //console.log(canvas.toDataURL("image/png"));

  if (destCanvas != null) {
    if (pos.x === -1 && pos.y === -1) {
      destCanvas.width = canvas.width;
      destCanvas.height = canvas.height;
      let ctxDest = destCanvas.getContext("2d");
      ctxDest.drawImage(canvas, 0, 0);

    } else {
      let ctxDest = destCanvas.getContext("2d");
      ctxDest.drawImage(canvas, pos.x * canvas.width, pos.y * canvas.height);

    }
  }

  canvas.width = 1;
  canvas.height = 1;
  chart.resize(1, 1);
  chart.clear();
  chart.destroy();

}

Bun.serve({
  async fetch(req) {

    let graphData = await req.json();
    const url = new URL(req.url);
    const width = Number(url.searchParams.get('width'));
    const height = Number(url.searchParams.get('height'));

    let canvas: any;

    let type;
    if (graphData[0] != null)
      type = graphData[0].optionType;
    else
      type = graphData.optionType;

    switch (type) {
      case "bar":
        canvas = createCanvas(width * graphData.length, height);
        for (let i = 0; i < graphData.length; i++) {
          let canvasGraph = createCanvas(width, height);
          createGraph(graphData[i], canvasGraph, canvas, { x: i, y: 0 });
        }
        break;

      case "well":
        canvas = createCanvas(width, height * graphData.length);

        for (let i = 0; i < graphData.length; i++) {
          let canvasGraph = createCanvas(width, height);
          createGraph(graphData[i], canvasGraph, canvas, { x: 0, y: i });
        }
        break;


      case "radar":
        canvas = createCanvas(200, 200);
        let canvasGraph = createCanvas(200, 200);
        createGraph(graphData, canvasGraph, canvas, { x: -1, y: -1 });
        break;

      default:
        console.error("unexpected");
        break;
    }

    let base64 = canvas.toDataURL("image/png");
    canvas.width = 1;
    canvas.height = 1;
    return new Response(base64);
  },
  port: 8084
});

